import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getBloodSugarReadings, getBloodSugarTrends } from './bloodSugarService.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function getDailySummary(userPhone) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('user_phone', userPhone)
      .eq('date', today)
      .single();

    if (error) throw error;
    
    // Get today's blood sugar readings
    const todayStart = new Date(today);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const { data: bloodSugarReadings, error: bsError } = await supabase
      .from('blood_sugar_logs')
      .select('*')
      .eq('user_phone', userPhone)
      .gte('timestamp', todayStart.toISOString())
      .lte('timestamp', todayEnd.toISOString())
      .order('timestamp', { ascending: false });
    
    if (bsError) {
      console.error('Error fetching blood sugar readings:', bsError);
    }
    
    // Add blood sugar data to the summary
    return {
      ...data,
      blood_sugar_readings: bloodSugarReadings || []
    };
  } catch (error) {
    console.error('Error in getDailySummary:', error);
    throw error;
  }
}

export async function getWeeklySummary(userPhone) {
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('user_phone', userPhone)
    .order('date', { ascending: false })
    .limit(7);

  if (error) throw error;
  return data;
}

export async function getMonthlySummary(userPhone) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('user_phone', userPhone)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false });

  if (error) throw error;
  return data;
}

function calculateAverages(summary) {
  const totalCalories = summary.reduce((sum, day) => sum + day.total_calories, 0);
  const totalMeals = summary.reduce((sum, day) => sum + day.meal_count, 0);
  const totalGreenFlags = summary.reduce((sum, day) => sum + day.green_flags_count, 0);
  const totalRedFlags = summary.reduce((sum, day) => sum + day.red_flags_count, 0);
  
  return {
    totalCalories,
    totalMeals,
    totalGreenFlags,
    totalRedFlags,
    avgDailyCalories: Math.round(totalCalories / summary.length),
    avgDailyMeals: (totalMeals / summary.length).toFixed(1),
    greenFlagPercentage: Math.round((totalGreenFlags / (totalGreenFlags + totalRedFlags)) * 100) || 0
  };
}

function generateInsights(stats, type) {
  const insights = [];
  
  // Calorie insights
  if (stats.avgDailyCalories > 2500) {
    insights.push("⚠️ Your daily calorie intake is above the recommended range. Consider reducing portion sizes.");
  } else if (stats.avgDailyCalories < 1500) {
    insights.push("⚠️ Your daily calorie intake is below the recommended range. Make sure you're getting enough nutrients.");
  }

  // Meal frequency insights
  if (stats.avgDailyMeals < 2) {
    insights.push("⚠️ You're having fewer meals than recommended. Try to maintain regular meal times.");
  } else if (stats.avgDailyMeals > 5) {
    insights.push("⚠️ You're having more frequent meals than recommended. Consider spacing them out more.");
  }

  // Healthy choices insights
  if (stats.greenFlagPercentage < 50) {
    insights.push("⚠️ Less than half of your choices are marked as healthy. Try incorporating more balanced meals.");
  } else if (stats.greenFlagPercentage > 80) {
    insights.push("✅ Great job! You're making mostly healthy choices. Keep it up!");
  }

  return insights;
}

export function formatSummaryMessage(summary, type) {
  if (!summary || (Array.isArray(summary) && summary.length === 0)) {
    return `No ${type} summary available yet. Start tracking your meals to see your progress!`;
  }

  let message = `📊 Your ${type} Summary:\n\n`;
  
  if (type === 'daily') {
    message += `Total Calories: ${summary.total_calories} kcal\n`;
    message += `Meals Today: ${summary.meal_count}\n`;
    message += `✅ Good Choices: ${summary.green_flags_count}\n`;
    message += `⚠️ Caution Needed: ${summary.red_flags_count}\n`;
    
    // Add blood sugar information if available
    if (summary.blood_sugar_readings && summary.blood_sugar_readings.length > 0) {
      message += '\n📈 Blood Sugar Readings Today:\n';
      
      // Calculate average
      const totalValue = summary.blood_sugar_readings.reduce((sum, reading) => sum + reading.value, 0);
      const avgValue = Math.round(totalValue / summary.blood_sugar_readings.length);
      
      // Find min and max
      const values = summary.blood_sugar_readings.map(reading => reading.value);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      
      message += `Readings: ${summary.blood_sugar_readings.length}\n`;
      message += `Average: ${avgValue} mg/dL\n`;
      message += `Range: ${minValue} - ${maxValue} mg/dL\n`;
      
      // Count readings by type
      const fastingReadings = summary.blood_sugar_readings.filter(r => r.type === 'fasting');
      const postMealReadings = summary.blood_sugar_readings.filter(r => r.type === 'post_meal');
      
      if (fastingReadings.length > 0) {
        const fastingAvg = Math.round(fastingReadings.reduce((sum, r) => sum + r.value, 0) / fastingReadings.length);
        message += `Fasting Average: ${fastingAvg} mg/dL\n`;
      }
      
      if (postMealReadings.length > 0) {
        const postMealAvg = Math.round(postMealReadings.reduce((sum, r) => sum + r.value, 0) / postMealReadings.length);
        message += `Post-Meal Average: ${postMealAvg} mg/dL\n`;
      }
    }
    
    // Add daily insights
    const greenFlagPercentage = Math.round((summary.green_flags_count / (summary.green_flags_count + summary.red_flags_count)) * 100) || 0;
    if (greenFlagPercentage < 50) {
      message += `\nToday's Insight: Try to make more balanced choices in your next meal.`;
    } else {
      message += `\nToday's Insight: You're making good progress! Keep it up!`;
    }
  } else {
    const stats = calculateAverages(summary);
    const insights = generateInsights(stats, type);
    
    message += `Total Calories: ${stats.totalCalories} kcal\n`;
    message += `Total Meals: ${stats.totalMeals}\n`;
    message += `✅ Good Choices: ${stats.totalGreenFlags}\n`;
    message += `⚠️ Caution Needed: ${stats.totalRedFlags}\n`;
    message += `\nAverage Daily Calories: ${stats.avgDailyCalories} kcal\n`;
    message += `Average Daily Meals: ${stats.avgDailyMeals}\n`;
    message += `Healthy Choice Rate: ${stats.greenFlagPercentage}%\n`;
    
    if (insights.length > 0) {
      message += `\n📝 Insights:\n${insights.join('\n')}`;
    }
  }
  
  message += `\n\n💡 Tip: Remember to maintain a balanced diet and stay hydrated!`;
  
  return message;
}

export const SUMMARY_OPTIONS = "Please choose a summary type:\n1. Daily Summary\n2. Weekly Summary\n3. Monthly Summary"; 