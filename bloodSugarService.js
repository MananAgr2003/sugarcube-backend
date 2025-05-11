/**
 * Blood Sugar Logging Service
 * Handles blood sugar level tracking, trend analysis, and correlation with meals
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Constants for blood sugar categories
export const BLOOD_SUGAR_TYPES = {
  FASTING: 'fasting',
  POST_MEAL: 'post_meal',
  RANDOM: 'random'
};

// Helper to format timestamp for PostgreSQL
function formatTimestampForPostgres(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Log a blood sugar reading for a user
 * @param {string} userPhone - User's phone number
 * @param {number} value - Blood sugar value in mg/dL
 * @param {string} type - Type of reading (fasting, post_meal, random)
 * @param {string} notes - Optional notes about the reading
 * @param {string} mealId - Optional ID of related meal entry
 * @returns {Promise<Object>} The created blood sugar entry
 */
export async function logBloodSugar(userPhone, value, type, notes = '', mealId = null) {
  try {
    // Validate input
    if (!userPhone) {
      throw new Error('Missing user phone number');
    }
    
    if (value === undefined || value === null) {
      throw new Error('Blood sugar value is required');
    }
    
    if (!type) {
      throw new Error('Blood sugar reading type is required');
    }

    // Parse and validate the blood sugar value
    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) {
      throw new Error('Blood sugar value must be a valid number');
    }
    
    // Additional validation for reasonable blood sugar values (10-600 mg/dL is a reasonable range)
    if (parsedValue < 10) {
      throw new Error('Blood sugar value is too low (below 10 mg/dL). Please verify your reading.');
    }
    
    if (parsedValue > 600) {
      throw new Error('Blood sugar value is too high (above 600 mg/dL). Please verify your reading or seek medical attention immediately.');
    }

    if (!Object.values(BLOOD_SUGAR_TYPES).includes(type)) {
      throw new Error(`Invalid blood sugar reading type: ${type}. Valid types are: ${Object.values(BLOOD_SUGAR_TYPES).join(', ')}`);
    }

    // Check if user exists in the database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone_number')
      .eq('phone_number', userPhone)
      .single();
      
    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking user existence:', userError);
      throw new Error(`Database error when checking user: ${userError.message || 'Unknown error'}`);
    }
    
    if (!user) {
      // Create basic user record if doesn't exist
      const { error: createUserError } = await supabase
        .from('users')
        .insert([{ 
          phone_number: userPhone,
          created_at: formatTimestampForPostgres(new Date()),
          last_active: formatTimestampForPostgres(new Date()),
          onboarded: false,
          track_blood_sugar: true
        }]);
      
      if (createUserError) {
        console.error('Error creating user:', createUserError);
        throw new Error(`Failed to create user record: ${createUserError.message || 'Unknown error'}`);
      }
    }

    // First, check if the blood_sugar_logs table exists
    try {
      // Try to select just one row to check if the table exists
      const { error: tableCheckError } = await supabase
        .from('blood_sugar_logs')
        .select('id')
        .limit(1);

      if (tableCheckError) {
        // If there's an error with a code that indicates the table doesn't exist
        if (tableCheckError.code === '42P01' || 
            (tableCheckError.message && tableCheckError.message.includes('relation') && tableCheckError.message.includes('does not exist'))) {
          throw new Error('The blood sugar logs table does not exist in the database. Please run the database migration script first.');
        }
      }
    } catch (tableError) {
      console.error('Error checking blood_sugar_logs table:', tableError);
      // If it's our own error message about the table, rethrow it directly
      if (tableError.message && tableError.message.includes('blood sugar logs table does not exist')) {
        throw tableError;
      }
      // Otherwise, provide a more generic error
      throw new Error('Failed to verify the blood sugar logging database. The table might not exist.');
    }

    // Create the blood sugar entry
    const insertResult = await supabase
      .from('blood_sugar_logs')
      .insert([
        {
          user_phone: userPhone,
          value: parsedValue,
          type: type,
          timestamp: formatTimestampForPostgres(new Date()),
          notes: notes,
          related_meal_id: mealId
        }
      ]);
    
    const error = insertResult.error;
    const data = insertResult.data;

    if (error) {
      console.error('Error logging blood sugar:', error);
      
      // Handle different types of database errors with specific messages
      if (error.code === '23505') {
        throw new Error('Duplicate blood sugar reading. A reading with the same parameters already exists.');
      } else if (error.code === '23503') {
        throw new Error('Related meal entry not found. Please check the meal ID.');
      } else if (error.code === '42P01' || (error.message && error.message.includes('relation') && error.message.includes('does not exist'))) {
        throw new Error('Blood sugar logs table does not exist. Please check your database setup.');
      } else {
        // Provide detailed error message, but handle cases where properties might be undefined
        const errorCode = error.code || 'unknown';
        const errorMsg = error.message || 'unknown error';
        throw new Error(`Database error when inserting blood sugar: ${errorMsg} (Code: ${errorCode})`);
      }
    }

    // After insert, fetch the inserted row to return it
    const { data: fetchedData, error: fetchError } = await supabase
      .from('blood_sugar_logs')
      .select('*')
      .eq('user_phone', userPhone)
      .eq('type', type)
      .order('timestamp', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching inserted blood sugar record:', fetchError);
      // Don't throw an error here since the insert was successful
      // Just return a basic success response
      return {
        success: true,
        user_phone: userPhone,
        value: parsedValue,
        type: type,
        timestamp: formatTimestampForPostgres(new Date())
      };
    }

    if (!fetchedData || fetchedData.length === 0) {
      console.warn('Blood sugar reading was saved but could not be retrieved');
      // Return basic success data
      return {
        success: true,
        user_phone: userPhone,
        value: parsedValue,
        type: type,
        timestamp: formatTimestampForPostgres(new Date())
      };
    }

    return fetchedData[0];
  } catch (error) {
    console.error('Blood sugar logging error:', error);
    // Re-throw the error with the original message to maintain the specific error details
    throw error;
  }
}

/**
 * Get blood sugar readings for a user within a date range
 * @param {string} userPhone - User's phone number
 * @param {number} days - Number of days to look back
 * @param {string} type - Optional filter by reading type
 * @returns {Promise<Array>} Blood sugar readings
 */
export async function getBloodSugarReadings(userPhone, days = 7, type = null) {
  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build query
    let query = supabase
      .from('blood_sugar_logs')
      .select('*')
      .eq('user_phone', userPhone)
      .gte('timestamp', formatTimestampForPostgres(startDate))
      .lte('timestamp', formatTimestampForPostgres(endDate))
      .order('timestamp', { ascending: false });

    // Add type filter if specified
    if (type && Object.values(BLOOD_SUGAR_TYPES).includes(type)) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching blood sugar readings:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getBloodSugarReadings:', error);
    throw error;
  }
}

/**
 * Get blood sugar trends, stats and analysis
 * @param {string} userPhone - User's phone number
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} Trend analysis data
 */
export async function getBloodSugarTrends(userPhone, days = 7) {
  try {
    // Get readings for the period
    const readings = await getBloodSugarReadings(userPhone, days);
    
    if (!readings || readings.length === 0) {
      return {
        readings_count: 0,
        average: null,
        min: null,
        max: null,
        fasting_avg: null,
        post_meal_avg: null,
        in_range_percentage: null,
        trend: 'No data available'
      };
    }

    // Calculate statistics
    const fastingReadings = readings.filter(r => r.type === BLOOD_SUGAR_TYPES.FASTING);
    const postMealReadings = readings.filter(r => r.type === BLOOD_SUGAR_TYPES.POST_MEAL);
    
    // Calculate averages
    const average = readings.reduce((sum, reading) => sum + reading.value, 0) / readings.length;
    const fastingAvg = fastingReadings.length > 0 
      ? fastingReadings.reduce((sum, reading) => sum + reading.value, 0) / fastingReadings.length 
      : null;
    const postMealAvg = postMealReadings.length > 0 
      ? postMealReadings.reduce((sum, reading) => sum + reading.value, 0) / postMealReadings.length 
      : null;

    // Find min and max
    const min = Math.min(...readings.map(r => r.value));
    const max = Math.max(...readings.map(r => r.value));

    // Calculate in-range percentage (70-180 mg/dL is commonly considered in range)
    const inRangeCount = readings.filter(r => r.value >= 70 && r.value <= 180).length;
    const inRangePercentage = (inRangeCount / readings.length) * 100;

    // Determine trend
    let trend = 'stable';
    if (readings.length >= 3) {
      // Sort by timestamp (oldest first)
      const sortedReadings = [...readings].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      // Simple linear regression to determine trend
      const firstHalf = sortedReadings.slice(0, Math.floor(sortedReadings.length / 2));
      const secondHalf = sortedReadings.slice(Math.floor(sortedReadings.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, r) => sum + r.value, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, r) => sum + r.value, 0) / secondHalf.length;
      
      if (secondHalfAvg > firstHalfAvg * 1.1) {
        trend = 'rising';
      } else if (secondHalfAvg < firstHalfAvg * 0.9) {
        trend = 'falling';
      }
    }

    return {
      readings_count: readings.length,
      average: parseFloat(average.toFixed(1)),
      min,
      max,
      fasting_avg: fastingAvg ? parseFloat(fastingAvg.toFixed(1)) : null,
      post_meal_avg: postMealAvg ? parseFloat(postMealAvg.toFixed(1)) : null,
      in_range_percentage: parseFloat(inRangePercentage.toFixed(1)),
      trend
    };
  } catch (error) {
    console.error('Error analyzing blood sugar trends:', error);
    throw error;
  }
}

/**
 * Correlate blood sugar readings with meals
 * @param {string} userPhone - User's phone number
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Array>} Correlated meal and blood sugar data
 */
export async function correlateMealsWithBloodSugar(userPhone, days = 7) {
  try {
    // Get recent food entries
    const { data: foodEntries, error: foodError } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_phone', userPhone)
      .gte('timestamp', formatTimestampForPostgres(new Date(Date.now() - days * 24 * 60 * 60 * 1000)))
      .order('timestamp', { ascending: false });

    if (foodError) throw foodError;

    // Get blood sugar readings
    const bloodSugarReadings = await getBloodSugarReadings(userPhone, days);

    // Correlate meals with post-meal readings
    const correlatedData = [];
    
    for (const meal of foodEntries) {
      const mealTime = new Date(meal.timestamp);
      
      // Find blood sugar readings within 2 hours after the meal
      const relatedReadings = bloodSugarReadings.filter(reading => {
        const readingTime = new Date(reading.timestamp);
        const timeDiff = (readingTime - mealTime) / (1000 * 60); // difference in minutes
        return timeDiff >= 0 && timeDiff <= 120 && reading.type === BLOOD_SUGAR_TYPES.POST_MEAL;
      });
      
      correlatedData.push({
        meal: {
          id: meal.id,
          timestamp: meal.timestamp,
          calories: meal.calories,
          details: meal.user_provided_details,
          is_recommended: meal.is_recommended
        },
        post_meal_readings: relatedReadings.map(r => ({
          value: r.value,
          timestamp: r.timestamp,
          minutes_after_meal: Math.round((new Date(r.timestamp) - mealTime) / (1000 * 60))
        }))
      });
    }

    return correlatedData;
  } catch (error) {
    console.error('Error correlating meals with blood sugar:', error);
    throw error;
  }
}

/**
 * Format blood sugar trends message for display
 * @param {Object} trendsData - Blood sugar trends data
 * @returns {string} Formatted message
 */
export function formatBloodSugarTrendsMessage(trendsData) {
  if (!trendsData || trendsData.readings_count === 0) {
    return "No blood sugar data available. Start logging your blood sugar readings to see trends.";
  }

  let message = "📊 Blood Sugar Trends 📊\n\n";
  
  message += `Readings: ${trendsData.readings_count} in the last 7 days\n`;
  message += `Average: ${trendsData.average} mg/dL\n`;
  message += `Range: ${trendsData.min} - ${trendsData.max} mg/dL\n\n`;
  
  if (trendsData.fasting_avg) {
    message += `Fasting Average: ${trendsData.fasting_avg} mg/dL\n`;
  }
  
  if (trendsData.post_meal_avg) {
    message += `Post-Meal Average: ${trendsData.post_meal_avg} mg/dL\n`;
  }
  
  message += `Time in Range: ${trendsData.in_range_percentage}%\n\n`;
  
  // Add trend analysis
  message += "Analysis: ";
  switch (trendsData.trend) {
    case 'rising':
      message += "⚠️ Your blood sugar levels show an upward trend. Consider reviewing your diet and medication.";
      break;
    case 'falling':
      message += "Your blood sugar levels show a downward trend. If too low, consider consulting your healthcare provider.";
      break;
    case 'stable':
      message += "👍 Your blood sugar levels appear stable.";
      break;
    default:
      message += "Not enough data to determine a trend.";
  }
  
  return message;
} 