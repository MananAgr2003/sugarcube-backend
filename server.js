/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';
import { getTranslation, SUPPORTED_LANGUAGES } from './translationService.js';

dotenv.config();

const AD_LINK = "https://www.profitableratecpm.com/mi7n4gt7ph?key=a19656e05ac3a0f50c8575dcbb424039";


import express from "express";
import axios from "axios";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { getDailySummary, getWeeklySummary, getMonthlySummary, formatSummaryMessage, SUMMARY_OPTIONS } from './summaryService.js';
import { logBloodSugar, getBloodSugarReadings, getBloodSugarTrends, correlateMealsWithBloodSugar, 
  formatBloodSugarTrendsMessage, BLOOD_SUGAR_TYPES } from './bloodSugarService.js';

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, SUPABASE_URL, SUPABASE_KEY } = process.env;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Store user states and images
const userStates = new Map();
const imageStorage = new Map();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Access your API key as an environment variable (see "Set up your API key" above)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" });

// Onboarding flow states and messages
const ONBOARDING_STEPS = {
  START: {
    message: {
      en: "Welcome to the health tracking service! Let's set up your profile. What's your name?",
      hi: "स्वास्थ्य ट्रैकिंग सेवा में आपका स्वागत है! आइए आपका प्रोफ़ाइल सेट करें। आपका नाम क्या है?"
    },
    nextStep: "NAME"
  },
  NAME: {
    message: {
      en: "Thanks! What type of diabetes do you have? (Type 1, Type 2, Gestational, or None)",
      hi: "धन्यवाद! आपको किस प्रकार का मधुमेह है? (टाइप 1, टाइप 2, गर्भकालीन, या कोई नहीं)"
    },
    nextStep: "DIABETES_TYPE"
  },
  DIABETES_TYPE: {
    message: {
      en: "Got it. Now, what's your daily calorie limit goal?",
      hi: "समझ गया। अब, आपका दैनिक कैलोरी सीमा लक्ष्य क्या है?"
    },
    nextStep: "DAILY_LIMIT"
  },
  DAILY_LIMIT: {
    message: {
      en: "Do you have any dietary preferences? (e.g., vegetarian, low-carb, etc.)",
      hi: "क्या आपकी कोई आहार संबंधी प्राथमिकताएँ हैं? (जैसे, शाकाहारी, कम-कार्ब, आदि)"
    },
    nextStep: "PREFERENCES"
  },
  PREFERENCES: {
    message: {
      en: "Do you want to track your blood sugar levels? (yes/no)",
      hi: "क्या आप अपने रक्त शर्करा के स्तर को ट्रैक करना चाहते हैं? (हां/नहीं)"
    },
    nextStep: "TRACK_BLOOD_SUGAR"
  },
  TRACK_BLOOD_SUGAR: {
    message: {
      en: "What is your preferred language? (en for English, hi for Hindi)",
      hi: "आपकी पसंदीदा भाषा क्या है? (अंग्रेजी के लिए en, हिंदी के लिए hi)"
    },
    nextStep: "LANGUAGE"
  },
  LANGUAGE: {
    message: {
      en: "Great! Your profile is now set up. You can update these details anytime by typing 'update profile'.\n\n" + AD_LINK,
      hi: "बहुत अच्छा! आपका प्रोफ़ाइल अब सेट हो गया है। आप 'update profile' टाइप करके किसी भी समय इन विवरणों को अपडेट कर सकते हैं।\n\n" + AD_LINK
    },
    nextStep: null
  }
};

// Blood sugar logging options message
const BLOOD_SUGAR_OPTIONS = {
  en: "What type of blood sugar reading would you like to log?\n" +
      "1. Fasting (before meal)\n" +
      "2. Post-meal (1-2 hours after eating)\n" +
      "3. Random (any other time)",
  hi: "आप किस प्रकार की रक्त शर्करा रीडिंग लॉग करना चाहेंगे?\n" +
      "1. उपवास (भोजन से पहले)\n" +
      "2. भोजन के बाद (खाने के 1-2 घंटे बाद)\n" +
      "3. रैंडम (किसी भी अन्य समय)"
};

// Define summary options with translations
const SUMMARY_OPTIONS_TRANSLATED = {
  en: "What type of summary would you like to see?\n" +
      "1. Daily Summary\n" +
      "2. Weekly Summary\n" +
      "3. Monthly Summary",
  hi: "आप किस प्रकार का सारांश देखना चाहेंगे?\n" +
      "1. दैनिक सारांश\n" +
      "2. साप्ताहिक सारांश\n" +
      "3. मासिक सारांश"
};

// Add ad link constant

app.post("/webhook", async (req, res) => {
  try {
    // log incoming messages
    console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const business_phone_number_id = req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
    const userPhone = message?.from;

    // Check if user exists and get language preference
    const { data: user } = await supabase
      .from('users')
      .select('language, onboarded')
      .eq('phone_number', userPhone)
      .single();
    
    // Default to English if no preference found
    const userLang = user?.language || 'en';
    const userOnboarded = user?.onboarded || false;
    
    // Handle interactive message responses
    if (message?.type === "interactive") {
      const interactiveType = message.interactive.type;
      const userState = userStates.get(userPhone);
      
      if (interactiveType === "button_reply") {
        const buttonId = message.interactive.button_reply.id;
        
        // Handle language selection buttons
        if (buttonId === "lang_en" || buttonId === "lang_hi") {
          // Check if we're in the onboarding flow
          if (userState?.onboarding && userState?.expectingButtonForLanguage) {
            // Set language preference in onboarding flow
            const newLang = buttonId === "lang_en" ? "en" : "hi";
            userState.userData.language = newLang;
            
            // Mark as onboarded and save user data
            userState.userData.onboarded = true;
            await saveUserData(userState.userData);
            
            // Send completion message
            const completionMessage = {
              en: "Great! Your profile is now set up. You can update these details anytime by typing 'update profile'.",
              hi: "बहुत अच्छा! आपका प्रोफ़ाइल अब सेट हो गया है। आप 'update profile' टाइप करके किसी भी समय इन विवरणों को अपडेट कर सकते हैं।"
            };
            
            await sendTranslatedMessage(
              business_phone_number_id, 
              userPhone, 
              completionMessage,
              newLang,
              message.id
            );
            
            // Clear onboarding state
            userStates.delete(userPhone);
          } 
          // Regular language change (not in onboarding)
          else {
            const newLang = buttonId === "lang_en" ? "en" : "hi";
            
            // Update user's language preference
            const { error } = await supabase
              .from('users')
              .update({ language: newLang })
              .eq('phone_number', userPhone);
              
            if (error) {
              console.error('Error updating language preference:', error);
              await sendTranslatedMessage(
                business_phone_number_id, 
                userPhone, 
                {
                  en: "There was an error updating your language preference. Please try again later.",
                  hi: "आपकी भाषा प्राथमिकता अपडेट करने में एक त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
                },
                userLang,
                message.id
              );
            } else {
              const successMessage = {
                en: "Your language preference has been updated to English.",
                hi: "आपकी भाषा प्राथमिकता हिंदी में अपडेट कर दी गई है।"
              };
              await sendTranslatedMessage(business_phone_number_id, userPhone, successMessage, newLang, message.id);
            }
            
            // Clear state
            userStates.delete(userPhone);
          }
        }
        // Handle diabetes type selection in onboarding
        else if ((buttonId === "type1" || buttonId === "type2" || buttonId === "none") && 
                 userState?.onboarding && userState?.expectingButtonForDiabetes) {
          
          // Map button IDs to diabetes types
          const diabetesTypeMap = {
            "type1": "Type 1",
            "type2": "Type 2",
            "none": "None"
          };
          
          // Set diabetes type
          userState.userData.diabetes_type = diabetesTypeMap[buttonId];
          
          // Move to next step - daily calorie limit
          userState.currentStep = 'DIABETES_TYPE';
          
          // Send next question
          await sendTranslatedMessage(
            business_phone_number_id, 
            userPhone, 
            ONBOARDING_STEPS.DIABETES_TYPE.message,
            userLang,
            message.id
          );
          
          // Reset the button expectation flag
          userState.expectingButtonForDiabetes = false;
        }
        // Handle blood sugar tracking preference in onboarding
        else if ((buttonId === "yes_blood_sugar" || buttonId === "no_blood_sugar") && 
                 userState?.onboarding && userState?.expectingButtonForBloodSugar) {
          
          // Set blood sugar tracking preference
          userState.userData.track_blood_sugar = (buttonId === "yes_blood_sugar");
          
          // Move to language selection step
          userState.currentStep = 'TRACK_BLOOD_SUGAR';
          
          // Present language options with buttons
          const languageButtons = [
            { id: "lang_en", text: { en: "English", hi: "अंग्रेजी" } },
            { id: "lang_hi", text: { en: "Hindi", hi: "हिंदी" } }
          ];
          
          await sendButtonMessage(
            business_phone_number_id,
            userPhone,
            { en: "Language Preference", hi: "भाषा प्राथमिकता" },
            { en: "What is your preferred language?", hi: "आपकी पसंदीदा भाषा क्या है?" },
            languageButtons,
            userLang,
            message.id
          );
          
          // Update state flags
          userState.expectingButtonForBloodSugar = false;
          userState.expectingButtonForLanguage = true;
        }
        // Handle blood sugar type selection
        else if (buttonId === "fasting" || buttonId === "post_meal" || buttonId === "random") {
          let bloodSugarType;
          
          switch (buttonId) {
            case "fasting":
              bloodSugarType = BLOOD_SUGAR_TYPES.FASTING;
              break;
            case "post_meal":
              bloodSugarType = BLOOD_SUGAR_TYPES.POST_MEAL;
              break;
            case "random":
              bloodSugarType = BLOOD_SUGAR_TYPES.RANDOM;
              break;
          }
          
          // Update state to wait for blood sugar value
          userStates.set(userPhone, { 
            waitingForBloodSugarValue: true,
            bloodSugarType: bloodSugarType
          });
          
          // Ask for the blood sugar value
          await sendTranslatedMessage(
            business_phone_number_id, 
            userPhone, 
            "Please enter your blood sugar value (in mg/dL):",
            userLang,
            message.id
          );
        }
        // Handle start onboarding button
        else if (buttonId === "start_onboarding") {
          await startOnboarding(business_phone_number_id, userPhone, message.id);
        }
        // Handle help button
        else if (buttonId === "help") {
          // Show help menu using list message
          const helpOptions = [
            {
              title: { en: "Available Commands", hi: "उपलब्ध कमांड्स" },
              rows: [
                { 
                  id: "send_food", 
                  title: { en: "Send Food Image", hi: "खाद्य छवि भेजें" },
                  description: { 
                    en: "Get calorie estimates and recommendations", 
                    hi: "कैलोरी अनुमान और सिफारिशें प्राप्त करें" 
                  }
                },
                { 
                  id: "start_onboarding", 
                  title: { en: "Start Onboarding", hi: "प्रोफाइल सेटअप" },
                  description: { 
                    en: "Set up or update your profile", 
                    hi: "अपना प्रोफ़ाइल सेट अप या अपडेट करें" 
                  }
                },
                { 
                  id: "log_blood_sugar", 
                  title: { en: "Log Blood Sugar", hi: "रक्त शर्करा लॉग करें" },
                  description: { 
                    en: "Log a new blood sugar reading", 
                    hi: "एक नया रक्त शर्करा रीडिंग लॉग करें" 
                  }
                },
                { 
                  id: "blood_sugar_trends", 
                  title: { en: "Blood Sugar Trends", hi: "रक्त शर्करा रुझान" },
                  description: { 
                    en: "See your trends and analysis", 
                    hi: "अपने रुझान और विश्लेषण देखें" 
                  }
                },
                { 
                  id: "summary", 
                  title: { en: "Summary", hi: "सारांश" },
                  description: { 
                    en: "View your health tracking summaries", 
                    hi: "अपने स्वास्थ्य ट्रैकिंग सारांश देखें" 
                  }
                },
                { 
                  id: "language", 
                  title: { en: "Change Language", hi: "भाषा बदलें" },
                  description: { 
                    en: "Change your language preference", 
                    hi: "अपनी भाषा प्राथमिकता बदलें" 
                  }
                }
              ]
            }
          ];
          
          await sendListMessage(
            business_phone_number_id,
            userPhone,
            { en: "Help Menu", hi: "सहायता मेनू" },
            { en: "Select an option to learn more or type the command directly", hi: "अधिक जानने के लिए एक विकल्प चुनें या सीधे कमांड टाइप करें" },
            { en: "View Options", hi: "विकल्प देखें" },
            helpOptions,
            userLang,
            message.id
          );
        }
        // Handle other button responses here
      }
      else if (interactiveType === "list_reply") {
        const listReplyId = message.interactive.list_reply.id;
        
        // Handle summary type selection
        if (listReplyId === "daily_summary") {
          try {
            const summaryData = await getDailySummary(userPhone);
            const summaryMessage = formatSummaryMessage(summaryData, 'daily') + `\n\n${AD_LINK}`;
            await sendTranslatedMessage(business_phone_number_id, userPhone, summaryMessage, userLang, message.id);
          } catch (error) {
            console.error('Error processing summary:', error);
            await sendTranslatedMessage(
              business_phone_number_id, 
              userPhone, 
              "Sorry, there was an error processing your summary request. Please try again later.",
              userLang,
              message.id
            );
          }
        }
        else if (listReplyId === "weekly_summary") {
          try {
            const summaryData = await getWeeklySummary(userPhone);
            const summaryMessage = formatSummaryMessage(summaryData, 'weekly') + `\n\n${AD_LINK}`;
            await sendTranslatedMessage(business_phone_number_id, userPhone, summaryMessage, userLang, message.id);
          } catch (error) {
            console.error('Error processing summary:', error);
            await sendTranslatedMessage(
              business_phone_number_id, 
              userPhone, 
              "Sorry, there was an error processing your summary request. Please try again later.",
              userLang,
              message.id
            );
          }
        }
        else if (listReplyId === "monthly_summary") {
          try {
            const summaryData = await getMonthlySummary(userPhone);
            const summaryMessage = formatSummaryMessage(summaryData, 'monthly') + `\n\n${AD_LINK}`;
            await sendTranslatedMessage(business_phone_number_id, userPhone, summaryMessage, userLang, message.id);
          } catch (error) {
            console.error('Error processing summary:', error);
            await sendTranslatedMessage(
              business_phone_number_id, 
              userPhone, 
              "Sorry, there was an error processing your summary request. Please try again later.",
              userLang,
              message.id
            );
          }
        }
        // Handle help menu selections
        else if (listReplyId === "send_food") {
          // Provide instructions about sending food images
          const foodInstructions = {
            en: "To analyze your food, simply send a photo of your meal, and I'll provide calorie estimates and health recommendations. You can also add a description after sending the image for more accurate analysis.",
            hi: "अपने भोजन का विश्लेषण करने के लिए, बस अपने भोजन की एक तस्वीर भेजें, और मैं कैलोरी अनुमान और स्वास्थ्य सिफारिशें प्रदान करूंगा। अधिक सटीक विश्लेषण के लिए आप छवि भेजने के बाद एक विवरण भी जोड़ सकते हैं।"
          };
          
          await sendTranslatedMessage(business_phone_number_id, userPhone, foodInstructions, userLang, message.id);
        }
        else if (listReplyId === "start_onboarding") {
          // Start the onboarding process
          await startOnboarding(business_phone_number_id, userPhone, message.id);
        }
        else if (listReplyId === "log_blood_sugar") {
          // Start blood sugar logging flow with interactive buttons
          const bloodSugarButtons = [
            { id: "fasting", text: { en: "Fasting (before meal)", hi: "उपवास (भोजन से पहले)" } },
            { id: "post_meal", text: { en: "Post-meal (1-2 hours after eating)", hi: "भोजन के बाद (खाने के 1-2 घंटे बाद)" } },
            { id: "random", text: { en: "Random (any other time)", hi: "रैंडम (किसी भी अन्य समय)" } }
          ];
          
          await sendButtonMessage(
            business_phone_number_id,
            userPhone,
            { en: "Blood Sugar Log", hi: "रक्त शर्करा लॉग" },
            { 
              en: `What type of blood sugar reading would you like to log?\n\n${AD_LINK}`, 
              hi: `आप किस प्रकार की रक्त शर्करा रीडिंग लॉग करना चाहेंगे?\n\n${AD_LINK}` 
            },
            bloodSugarButtons,
            userLang,
            message.id
          );
        }
        else if (listReplyId === "blood_sugar_trends") {
          // Show blood sugar trends
          try {
            const trendsData = await getBloodSugarTrends(userPhone);
            const trendsMessage = formatBloodSugarTrendsMessage(trendsData) + `\n\n${AD_LINK}`;
            await sendTranslatedMessage(business_phone_number_id, userPhone, trendsMessage, userLang, message.id);
          } catch (error) {
            console.error('Error fetching blood sugar trends:', error);
            const errorMessage = {
              en: "Sorry, there was an error fetching your blood sugar trends. Please try again later.",
              hi: "क्षमा करें, आपके रक्त शर्करा के रुझान प्राप्त करने में त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
            };
            await sendTranslatedMessage(business_phone_number_id, userPhone, errorMessage, userLang, message.id);
          }
        }
        else if (listReplyId === "summary") {
          // Show summary options
          const summaryOptions = [
            {
              title: { en: "Summary Types", hi: "सारांश प्रकार" },
              rows: [
                { id: "daily_summary", title: { en: "Daily Summary", hi: "दैनिक सारांश" } },
                { id: "weekly_summary", title: { en: "Weekly Summary", hi: "साप्ताहिक सारांश" } },
                { id: "monthly_summary", title: { en: "Monthly Summary", hi: "मासिक सारांश" } }
              ]
            }
          ];
          
          await sendListMessage(
            business_phone_number_id,
            userPhone,
            { en: "Health Summary", hi: "स्वास्थ्य सारांश" },
            { 
              en: `What type of summary would you like to see?\n\n${AD_LINK}`, 
              hi: `आप किस प्रकार का सारांश देखना चाहेंगे?\n\n${AD_LINK}` 
            },
            { en: "Select Option", hi: "विकल्प चुनें" },
            summaryOptions,
            userLang,
            message.id
          );
        }
        else if (listReplyId === "language") {
          // Show language selection buttons
          const languageButtons = [
            { id: "lang_en", text: { en: "English", hi: "अंग्रेजी" } },
            { id: "lang_hi", text: { en: "Hindi", hi: "हिंदी" } }
          ];
          
          await sendButtonMessage(
            business_phone_number_id,
            userPhone,
            { en: "Language Settings", hi: "भाषा सेटिंग्स" },
            { 
              en: `Select your preferred language:\n\n${AD_LINK}`, 
              hi: `अपनी पसंदीदा भाषा चुनें:\n\n${AD_LINK}` 
            },
            languageButtons,
            userLang,
            message.id
          );
        }
      }
      
      await markMessageAsRead(business_phone_number_id, message.id);
    }
    // check if the incoming message contains text
    else if (message?.type === "text") {
      const userState = userStates.get(userPhone);
      
      if (message.text.body.toLowerCase() === 'start onboarding' || message.text.body.toLowerCase() === 'update profile') {
        // Start onboarding flow
        await startOnboarding(business_phone_number_id, userPhone, message.id);
      } else if (userState?.onboarding) {
        // Handle onboarding flow
        await handleOnboardingStep(business_phone_number_id, userPhone, message.text.body, userState, message.id);
      } else if (userState?.waitingForBloodSugarType) {
        // Handle blood sugar type selection
        await handleBloodSugarTypeSelection(business_phone_number_id, userPhone, message.text.body, message.id);
      } else if (userState?.waitingForBloodSugarValue) {
        // Handle blood sugar value input
        await handleBloodSugarValueInput(business_phone_number_id, userPhone, message.text.body, userState, message.id);
      } else if (userState?.waitingForDetails) {
        const imageAnalysis = imageStorage.get(userPhone);
        if (imageAnalysis) {
          try {
            const analysis = await analyzeImageWithDetails(imageAnalysis, {
              description: message.text.body,
              userPhone: userPhone
            });
            
            // Store the entry in database without image
            const result = await storeFoodEntry(
              userPhone,
              null,
              analysis.calories,
              message.text.body,
              analysis.analysis,
              analysis.is_recommended,
              analysis.reason,
              analysis.personalized_tips
            );

            // Check if user is onboarded
            if (!result.userOnboarded) {
              // Prepare response message with onboarding suggestion
              let response;
              
              if (userLang === 'hi') {
                response = `कैलोरी अनुमान: ${analysis.calories} kcal\n`;
                response += `अनुशंसा: ${analysis.is_recommended ? '✅ अच्छा विकल्प!' : '⚠️ अनुशंसित नहीं'}\n`;
                response += `कारण: ${analysis.reason}\n\n`;
                response += `मैंने देखा कि आपने अभी तक अपना प्रोफ़ाइल सेटअप पूरा नहीं किया है। अपना प्रोफ़ाइल सेट करने से मुझे अधिक व्यक्तिगत सिफारिशें प्रदान करने में मदद मिलेगी।\n\nअपना प्रोफ़ाइल सेट करने के लिए 'start onboarding' टाइप करें।\n\n${AD_LINK}`;
              } else {
                response = `Calorie estimate: ${analysis.calories} kcal\n`;
                response += `Recommendation: ${analysis.is_recommended ? '✅ Good choice!' : '⚠️ Not recommended'}\n`;
                response += `Reason: ${analysis.reason}\n\n`;
                response += `I notice you haven't completed your profile setup yet. Setting up your profile will help me provide more personalized recommendations.\n\nType 'start onboarding' to set up your profile.\n\n${AD_LINK}`;
              }
              
              await sendTranslatedMessage(business_phone_number_id, userPhone, response, userLang, message.id);
            } else {
              // Get user insights for onboarded users
              const insights = await getUserInsights(userPhone);
              
              // Prepare response message with personalized tips
              let response;
              
              if (userLang === 'hi') {
                response = `कैलोरी अनुमान: ${analysis.calories} kcal\n`;
                response += `अनुशंसा: ${analysis.is_recommended ? '✅ अच्छा विकल्प!' : '⚠️ अनुशंसित नहीं'}\n`;
                response += `कारण: ${analysis.reason}\n\n`;
                
                // Add personalized tips if available
                if (analysis.personalized_tips) {
                  response += `व्यक्तिगत सलाह: ${analysis.personalized_tips}\n\n`;
                }
                
                // Add insights if available
                if (insights.weeklySummary.length > 0) {
                  const today = insights.weeklySummary[0];
                  response += `आज का सारांश:\n`;
                  response += `- कुल कैलोरी: ${today.total_calories}\n`;
                  response += `- भोजन: ${today.meal_count}\n`;
                  response += `- अच्छे विकल्प: ${today.green_flags_count}\n`;
                  response += `- सावधानी आवश्यक: ${today.red_flags_count}\n`;
                }
                
                // Add ad link
                response += `\n${AD_LINK}`;
              } else {
                response = `Calorie estimate: ${analysis.calories} kcal\n`;
                response += `Recommendation: ${analysis.is_recommended ? '✅ Good choice!' : '⚠️ Not recommended'}\n`;
                response += `Reason: ${analysis.reason}\n\n`;
                
                // Add personalized tips if available
                if (analysis.personalized_tips) {
                  response += `Personalized advice: ${analysis.personalized_tips}\n\n`;
                }
                
                // Add insights if available
                if (insights.weeklySummary.length > 0) {
                  const today = insights.weeklySummary[0];
                  response += `Today's Summary:\n`;
                  response += `- Total Calories: ${today.total_calories}\n`;
                  response += `- Meals: ${today.meal_count}\n`;
                  response += `- Good Choices: ${today.green_flags_count}\n`;
                  response += `- Caution Needed: ${today.red_flags_count}\n`;
                }
                
                // Add ad link
                response += `\n${AD_LINK}`;
              }

              await sendTranslatedMessage(business_phone_number_id, userPhone, response, userLang, message.id);
            }
          } catch (error) {
            console.error('Error processing food entry:', error);
            await sendTranslatedMessage(
              business_phone_number_id, 
              userPhone, 
              "Sorry, there was an error processing your food entry. Please try again later.",
              userLang,
              message.id
            );
          } finally {
            // Clear the state regardless of success or failure
            userStates.delete(userPhone);
            imageStorage.delete(userPhone);
          }
        }
      } else if (message.text.body.toLowerCase() === 'summary') {
        // Use list message for summary options
        const summaryOptions = [
          {
            title: { en: "Summary Types", hi: "सारांश प्रकार" },
            rows: [
              { id: "daily_summary", title: { en: "Daily Summary", hi: "दैनिक सारांश" } },
              { id: "weekly_summary", title: { en: "Weekly Summary", hi: "साप्ताहिक सारांश" } },
              { id: "monthly_summary", title: { en: "Monthly Summary", hi: "मासिक सारांश" } }
            ]
          }
        ];
        
        await sendListMessage(
          business_phone_number_id,
          userPhone,
          { en: "Health Summary", hi: "स्वास्थ्य सारांश" },
          { 
            en: `What type of summary would you like to see?\n\n${AD_LINK}`, 
            hi: `आप किस प्रकार का सारांश देखना चाहेंगे?\n\n${AD_LINK}` 
          },
          { en: "Select Option", hi: "विकल्प चुनें" },
          summaryOptions,
          userLang,
          message.id
        );
      } else if (message.text.body.toLowerCase() === 'log blood sugar' || message.text.body.toLowerCase() === 'blood sugar') {
        // Use button message for blood sugar type selection
        const bloodSugarButtons = [
          { id: "fasting", text: { en: "Fasting (before meal)", hi: "उपवास (भोजन से पहले)" } },
          { id: "post_meal", text: { en: "Post-meal (1-2 hours after eating)", hi: "भोजन के बाद (खाने के 1-2 घंटे बाद)" } },
          { id: "random", text: { en: "Random (any other time)", hi: "रैंडम (किसी भी अन्य समय)" } }
        ];
        
        await sendButtonMessage(
          business_phone_number_id,
          userPhone,
          { en: "Blood Sugar Log", hi: "रक्त शर्करा लॉग" },
          { 
            en: `What type of blood sugar reading would you like to log?\n\n${AD_LINK}`, 
            hi: `आप किस प्रकार की रक्त शर्करा रीडिंग लॉग करना चाहेंगे?\n\n${AD_LINK}` 
          },
          bloodSugarButtons,
          userLang,
          message.id
        );
      } else if (message.text.body.toLowerCase() === 'blood sugar trends' || message.text.body.toLowerCase() === 'trends') {
        // Show blood sugar trends
        try {
          const trendsData = await getBloodSugarTrends(userPhone);
          const trendsMessage = formatBloodSugarTrendsMessage(trendsData) + `\n\n${AD_LINK}`;
          await sendTranslatedMessage(business_phone_number_id, userPhone, trendsMessage, userLang, message.id);
        } catch (error) {
          console.error('Error fetching blood sugar trends:', error);
          await sendTranslatedMessage(business_phone_number_id, userPhone, "Sorry, there was an error fetching your blood sugar trends.", userLang, message.id);
        }
      } else if (message.text.body.toLowerCase() === 'language' || message.text.body.toLowerCase() === 'change language') {
        // Use button message for language selection
        const languageButtons = [
          { id: "lang_en", text: { en: "English", hi: "अंग्रेजी" } },
          { id: "lang_hi", text: { en: "Hindi", hi: "हिंदी" } }
        ];
        
        await sendButtonMessage(
          business_phone_number_id,
          userPhone,
          { en: "Language Settings", hi: "भाषा सेटिंग्स" },
          { 
            en: `Select your preferred language:\n\n${AD_LINK}`, 
            hi: `अपनी पसंदीदा भाषा चुनें:\n\n${AD_LINK}` 
          },
          languageButtons,
          userLang,
          message.id
        );
      } else if (message.text.body.toLowerCase() === 'help') {
        // Use list message for help menu
        const helpOptions = [
          {
            title: { en: "Available Commands", hi: "उपलब्ध कमांड्स" },
            rows: [
              { 
                id: "send_food", 
                title: { en: "Send Food Image", hi: "खाद्य छवि भेजें" },
                description: { 
                  en: "Get calorie estimates and recommendations", 
                  hi: "कैलोरी अनुमान और सिफारिशें प्राप्त करें" 
                }
              },
              { 
                id: "start_onboarding", 
                title: { en: "Start Onboarding", hi: "प्रोफाइल सेटअप" },
                description: { 
                  en: "Set up or update your profile", 
                  hi: "अपना प्रोफ़ाइल सेट अप या अपडेट करें" 
                }
              },
              { 
                id: "log_blood_sugar", 
                title: { en: "Log Blood Sugar", hi: "रक्त शर्करा लॉग करें" },
                description: { 
                  en: "Log a new blood sugar reading", 
                  hi: "एक नया रक्त शर्करा रीडिंग लॉग करें" 
                }
              },
              { 
                id: "blood_sugar_trends", 
                title: { en: "Blood Sugar Trends", hi: "रक्त शर्करा रुझान" },
                description: { 
                  en: "See your trends and analysis", 
                  hi: "अपने रुझान और विश्लेषण देखें" 
                }
              },
              { 
                id: "summary", 
                title: { en: "Summary", hi: "सारांश" },
                description: { 
                  en: "View your health tracking summaries", 
                  hi: "अपने स्वास्थ्य ट्रैकिंग सारांश देखें" 
                }
              },
              { 
                id: "language", 
                title: { en: "Change Language", hi: "भाषा बदलें" },
                description: { 
                  en: "Change your language preference", 
                  hi: "अपनी भाषा प्राथमिकता बदलें" 
                }
              }
            ]
          }
        ];
        
        await sendListMessage(
          business_phone_number_id,
          userPhone,
          { en: "Help Menu", hi: "सहायता मेनू" },
          { 
            en: `Select an option to learn more or type the command directly\n\n${AD_LINK}`, 
            hi: `अधिक जानने के लिए एक विकल्प चुनें या सीधे कमांड टाइप करें\n\n${AD_LINK}` 
          },
          { en: "View Options", hi: "विकल्प देखें" },
          helpOptions,
          userLang,
          message.id
        );
      } else {
        // If user not onboarded, show welcome with buttons
        if (!userOnboarded) {
          const welcomeButtons = [
            { id: "start_onboarding", text: { en: "Set Up Profile", hi: "प्रोफ़ाइल सेट करें" } },
            { id: "help", text: { en: "Show Help", hi: "सहायता दिखाएँ" } }
          ];
          
          await sendButtonMessage(
            business_phone_number_id,
            userPhone,
            { en: "Welcome!", hi: "स्वागत है!" },
            { 
              en: `Welcome to the health tracking service! To get started, set up your profile or send a food image to get calorie estimates.\n\n${AD_LINK}`, 
              hi: `स्वास्थ्य ट्रैकिंग सेवा में आपका स्वागत है! शुरू करने के लिए, अपना प्रोफाइल सेट करें या कैलोरी अनुमान प्राप्त करने के लिए एक खाद्य छवि भेजें।\n\n${AD_LINK}` 
            },
            welcomeButtons,
            userLang,
            message.id
          );
        } else {
          // Echo message for onboarded users
          const echoPrefix = {
            en: "Echo: ",
            hi: "प्रतिध्वनि: "
          };
          await sendTranslatedMessage(
            business_phone_number_id, 
            userPhone, 
            { 
              en: echoPrefix.en + message.text.body + `\n\n${AD_LINK}`, 
              hi: echoPrefix.hi + message.text.body + `\n\n${AD_LINK}` 
            },
            userLang,
            message.id
          );
        }
      }

      await markMessageAsRead(business_phone_number_id, message.id);
    } 
    else if (message?.type === "image") {
      const imageId = message.image.id;
      try {
        const base64Image = await downloadAndProcessImage(imageId);
        
        // Store the image for later use
        imageStorage.set(userPhone, base64Image);
        
        // Set user state to waiting for details
        userStates.set(userPhone, { waitingForDetails: true });
        
        // Ask for additional details
        await sendTranslatedMessage(
          business_phone_number_id, 
          userPhone, 
          {
            en: `Do you want to add details for the recipe? Please provide any additional information about ingredients, cooking method, or portion size.\n\n${AD_LINK}`,
            hi: `क्या आप व्यंजन के लिए विवरण जोड़ना चाहते हैं? कृपया सामग्री, खाना पकाने की विधि, या भाग के आकार के बारे में कोई अतिरिक्त जानकारी प्रदान करें।\n\n${AD_LINK}`
          },
          userLang,
          message.id
        );
        
      } catch (error) {
        console.error("Error processing image:", error);
        await sendTranslatedMessage(business_phone_number_id, userPhone, "Sorry, there was an error processing your image.", userLang, message.id);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Updated function to send translated messages
async function sendTranslatedMessage(business_phone_number_id, to, messageObj, lang, contextMessageId) {
  // Get the appropriate translation based on language code
  let text;
  
  if (typeof messageObj === 'string') {
    // If it's a string, try to get translation from the dictionary
    text = await getTranslation(messageObj, lang);
  } else {
    // If it's an object with language keys, use the appropriate one
    text = messageObj[lang] || messageObj['en'] || '';  // Fallback to English if specific language not available
  }
  
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      to: to,
      text: { body: text },
      context: {
        message_id: contextMessageId,
      },
    },
  });
}

// Helper function to mark messages as read
async function markMessageAsRead(business_phone_number_id, messageId) {
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
  });
}

// Helper function to download and process image
async function downloadAndProcessImage(imageId) {
  const mediaResponse = await axios({
    method: "GET",
    url: `https://graph.facebook.com/v22.0/${imageId}`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
  });
  
  const mediaUrl = mediaResponse.data.url;
  const downloadResponse = await axios({
    method: "GET",
    url: mediaUrl,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    responseType: "arraybuffer",
  });
  
  return Buffer.from(downloadResponse.data).toString("base64");
}

// Modified analyzeImageWithDetails function to handle JSON parsing better and support Hindi
async function analyzeImageWithDetails(base64Image, userDetails) {
  try {
    // Get user profile data if available
    let userProfile = null;
    const userPhone = userDetails.userPhone;
    
    if (userPhone) {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', userPhone)
        .single();
      
      if (user) {
        userProfile = user;
      }
    }
    
    // Get user's language preference
    const userLanguage = userProfile?.language || 'en';
    const isHindi = userLanguage === 'hi';
    
    // Build prompt based on user profile
    let prompt = isHindi 
      ? `इस भोजन की छवि का विश्लेषण करें और निम्नलिखित उपयोगकर्ता द्वारा प्रदान किए गए विवरण का भी विश्लेषण करें: "${userDetails.description || userDetails}".
      यदि विवरण कैलोरी गणना के लिए प्रासंगिक और मान्य हैं, तो सटीकता में सुधार के लिए उनका उपयोग करें।
      यदि विवरण अमान्य या अप्रासंगिक हैं, तो उन्हें नजरअंदाज करें और गणना को केवल छवि पर आधारित करें।
      यह भी निर्धारित करें कि क्या यह भोजन मधुमेह वाले व्यक्ति के लिए उपयुक्त होगा, इस आधार पर:
      1. कुल कैलोरी
      2. चीनी सामग्री
      3. कार्बोहाइड्रेट सामग्री
      4. समग्र पोषण संतुलन`
      : `Analyze this food image and the following user-provided details: "${userDetails.description || userDetails}". 
      If the details are relevant and valid for calorie calculation, use them to improve the accuracy.
      If the details are invalid or irrelevant, ignore them and base the calculation on the image only.
      Also determine if this meal would be suitable for a diabetic person based on:
      1. Total calories
      2. Sugar content
      3. Carbohydrate content
      4. Overall nutritional balance`;
    
    // Add personalized context if user profile exists
    if (userProfile) {
      if (isHindi) {
        prompt += `\n\nकृपया यह भी ध्यान रखें कि इस उपयोगकर्ता के पास:
        - ${userProfile.diabetes_type} मधुमेह है
        - दैनिक कैलोरी सीमा ${userProfile.daily_limit} kcal है
        - इनकी आहार संबंधी प्राथमिकताएँ हैं: ${userProfile.preferences?.dietary || 'कोई निर्दिष्ट नहीं'}`;
      } else {
        prompt += `\n\nPlease also consider that this user:
        - Has ${userProfile.diabetes_type} diabetes
        - Has a daily calorie limit of ${userProfile.daily_limit} kcal
        - Has these dietary preferences: ${userProfile.preferences?.dietary || 'None specified'}`;
      }
    }
    
    // Specify response format
    if (isHindi) {
      prompt += `\n\nअपना उत्तर इस सटीक प्रारूप में प्रदान करें (कोई मार्कडाउन नहीं, कोई कोड ब्लॉक नहीं):
      {
        "calories": संख्या,
        "is_recommended": बूलियन,
        "reason": "मधुमेह रोगियों के लिए यह अनुशंसित है या नहीं, इसका कारण बताता हुआ वाक्य",
        "analysis": "भोजन का विस्तृत विश्लेषण",
        "personalized_tips": "उपयोगकर्ता के प्रोफाइल के आधार पर व्यक्तिगत आहार संबंधी सलाह"
      }

      कृपया अपने सभी उत्तर हिंदी में प्रदान करें, केवल "calories" और "is_recommended" जैसे JSON कुंजी नाम अंग्रेजी में रखें।`;
    } else {
      prompt += `\n\nProvide your response in this exact format (no markdown, no code blocks):
      {
        "calories": number,
        "is_recommended": boolean,
        "reason": "string explaining why this is recommended or not for diabetics",
        "analysis": "detailed analysis of the meal",
        "personalized_tips": "personalized dietary advice based on the user's profile"
      }`;
    }
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg",
        },
      },
      prompt
    ]);
    
    // Clean the response text before parsing
    const responseText = result.response.text().trim();
    const cleanJson = responseText.replace(/```json\n|\n```/g, '').trim();
    
    try {
      const analysis = JSON.parse(cleanJson);
      return analysis;
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Response text:', responseText);
      
      if (isHindi) {
        return {
          calories: 0,
          is_recommended: false,
          reason: "भोजन का विश्लेषण करने में असमर्थ",
          analysis: "पार्सिंग त्रुटि के कारण विश्लेषण विफल रहा",
          personalized_tips: "व्यक्तिगत सिफारिशें प्रदान करने में असमर्थ"
        };
      } else {
        return {
          calories: 0,
          is_recommended: false,
          reason: "Could not analyze the meal properly",
          analysis: "Analysis failed due to parsing error",
          personalized_tips: "Unable to provide personalized recommendations"
        };
      }
    }
  } catch (error) {
    console.error("Analysis error:", error);
    
    const userLang = userProfile?.language || 'en';
    if (userLang === 'hi') {
      return {
        calories: 0,
        is_recommended: false,
        reason: "विश्लेषण विफल रहा",
        analysis: "छवि का विश्लेषण नहीं किया जा सका",
        personalized_tips: "व्यक्तिगत सिफारिशें प्रदान करने में असमर्थ"
      };
    } else {
      return {
        calories: 0,
        is_recommended: false,
        reason: "Analysis failed",
        analysis: "Could not analyze the image",
        personalized_tips: "Unable to provide personalized recommendations"
      };
    }
  }
}

// Helper function to format timestamp for PostgreSQL
function formatTimestampForPostgres(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

// Modified storeFoodEntry function with proper timestamp formatting
async function storeFoodEntry(userPhone, base64Image, calories, userDetails, aiAnalysis, isRecommended, reason, personalizedTips) {
  try {
    // First, ensure the user exists in the users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', userPhone)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking user:', userError);
      throw userError;
    }

    // If user doesn't exist, create a basic user record
    if (!user) {
      const { error: createUserError } = await supabase
        .from('users')
        .insert([{ 
          phone_number: userPhone,
          created_at: formatTimestampForPostgres(new Date()),
          last_active: formatTimestampForPostgres(new Date()),
          onboarded: false
        }]);
      
      if (createUserError) {
        console.error('Error creating user:', createUserError);
        throw createUserError;
      }
    } else {
      // Update last_active for existing user
      await supabase
        .from('users')
        .update({ last_active: formatTimestampForPostgres(new Date()) })
        .eq('phone_number', userPhone);
    }

    // Store food entry with properly formatted timestamp and personalized tips
    const { data, error } = await supabase
      .from('food_entries')
      .insert([
        {
          user_phone: userPhone,
          calories: parseInt(calories),
          timestamp: formatTimestampForPostgres(new Date()),
          user_provided_details: userDetails,
          ai_analysis: aiAnalysis,
          is_recommended: isRecommended,
          reason_for_recommendation: reason,
          personalized_tips: personalizedTips
        }
      ])
      .select();

    if (error) {
      console.error('Database insert error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }

    // Update daily summary
    await updateDailySummary(userPhone, parseInt(calories), isRecommended);

    return { data, userOnboarded: user ? user.onboarded : false };
  } catch (error) {
    console.error('Error storing food entry:', error);
    throw error;
  }
}

// Modified updateDailySummary with proper date handling
async function updateDailySummary(userPhone, calories, isRecommended) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  try {
    // Get existing summary for today
    const { data: existingSummary, error: fetchError } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('user_phone', userPhone)
      .eq('date', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching daily summary:', fetchError);
      throw fetchError;
    }

    if (existingSummary) {
      // Update existing summary
      const { error: updateError } = await supabase
        .from('daily_summaries')
        .update({
          total_calories: existingSummary.total_calories + calories,
          meal_count: existingSummary.meal_count + 1,
          red_flags_count: isRecommended ? existingSummary.red_flags_count : existingSummary.red_flags_count + 1,
          green_flags_count: isRecommended ? existingSummary.green_flags_count + 1 : existingSummary.green_flags_count
        })
        .eq('id', existingSummary.id);

      if (updateError) {
        console.error('Error updating daily summary:', updateError);
        throw updateError;
      }
    } else {
      // Create new summary
      const { error: insertError } = await supabase
        .from('daily_summaries')
        .insert([
          {
            user_phone: userPhone,
            date: today,
            total_calories: calories,
            meal_count: 1,
            red_flags_count: isRecommended ? 0 : 1,
            green_flags_count: isRecommended ? 1 : 0
          }
        ]);

      if (insertError) {
        console.error('Error creating daily summary:', insertError);
        throw insertError;
      }
    }
  } catch (error) {
    console.error('Error in updateDailySummary:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw error;
  }
}

// Helper function to get user insights
async function getUserInsights(userPhone) {
  try {
    // Get last 7 days of summaries
    const { data: summaries, error: summariesError } = await supabase
      .from('daily_summaries')
      .select('*')
      .eq('user_phone', userPhone)
      .order('date', { ascending: false })
      .limit(7);

    if (summariesError) throw summariesError;

    // Get recent food entries
    const { data: recentFoods, error: foodsError } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_phone', userPhone)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (foodsError) throw foodsError;

    return {
      weeklySummary: summaries,
      recentFoods: recentFoods
    };
  } catch (error) {
    console.error('Error getting user insights:', error);
    throw error;
  }
}

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req, res) => {
  console.log(req.query);
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    console.log;
    console.log("Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT || 3000, () => {
  console.log(`Server is listening on port: ${PORT || 3000}`);
});

async function analyzeImage(base64Image) {
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg",
        },
      },
      "Analyze the provided food image. Identify the type and portion of the food and accurately determine its energy content in kilocalories (kcal). Your response must be strictly a single numerical value (e.g., '500') with no extra text, units, explanation, or disclaimer. Ensure your estimation is as precise and consistent as possible.",
    ]);
    console.log(result.response.text());
    return result.response.text();
  } catch (error) {
    console.error("OpenAI analysis error:", error);
    return "Analysis failed";
  }
}

// Updated function to start onboarding process with interactive messages
async function startOnboarding(business_phone_number_id, userPhone, messageId) {
  try {
    // Check if the user already exists and get their data
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', userPhone)
      .single();
    
    // Get user's language preference or default to English
    const userLang = existingUser?.language || 'en';
    
    // Set initial onboarding state
    userStates.set(userPhone, { 
      onboarding: true, 
      currentStep: 'START',
      userData: existingUser || { phone_number: userPhone, language: userLang }
    });
    
    // Send first onboarding message with a header
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      {
        en: "Welcome to the health tracking service! Let's set up your profile. What's your name?",
        hi: "स्वास्थ्य ट्रैकिंग सेवा में आपका स्वागत है! आइए आपका प्रोफ़ाइल सेट करें। आपका नाम क्या है?"
      },
      userLang,
      messageId
    );
  } catch (error) {
    console.error('Error starting onboarding:', error);
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      {
        en: "Sorry, there was an error starting the onboarding process. Please try again later.",
        hi: "क्षमा करें, ऑनबोर्डिंग प्रक्रिया शुरू करने में एक त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
      },
      'en', // Default to English for error messages if we can't determine language
      messageId
    );
  }
}

// Updated function to handle onboarding steps with interactive options where appropriate
async function handleOnboardingStep(business_phone_number_id, userPhone, messageText, userState, messageId) {
  try {
    const currentStep = userState.currentStep;
    const userData = userState.userData;
    const userLang = userData.language || 'en';
    
    // Update the user data based on current step
    switch (currentStep) {
      case 'START':
        userData.name = messageText.trim();
        break;
      case 'NAME':
        // For diabetes type, use buttons for common options
        // First check if the user sent a text response
        userData.diabetes_type = messageText.trim();
        break;
      case 'DIABETES_TYPE':
        // Validate that the input is a number
        const calorieLimit = parseInt(messageText.trim());
        if (isNaN(calorieLimit)) {
          const errorMessage = {
            en: "Please enter a valid number for your daily calorie limit.",
            hi: "कृपया अपनी दैनिक कैलोरी सीमा के लिए एक वैध संख्या दर्ज करें।"
          };
          await sendTranslatedMessage(
            business_phone_number_id, 
            userPhone, 
            errorMessage,
            userLang,
            messageId
          );
          return; // Don't proceed to next step
        }
        userData.daily_limit = calorieLimit;
        break;
      case 'PREFERENCES':
        userData.preferences = { dietary: messageText.trim() };
        break;
      case 'TRACK_BLOOD_SUGAR':
        // Set track_blood_sugar flag based on user's response
        const response = messageText.trim().toLowerCase();
        if (response === 'yes' || response === 'y' || response === 'हां' || response === 'हाँ') {
          userData.track_blood_sugar = true;
        } else {
          userData.track_blood_sugar = false;
        }
        break;
      case 'LANGUAGE':
        // Set language preference
        const lang = messageText.trim().toLowerCase();
        if (lang === 'hi' || lang === 'hindi' || lang === 'हिंदी') {
          userData.language = 'hi';
        } else {
          userData.language = 'en';  // Default to English for anything else
        }
        userData.onboarded = true;
        
        // Automatically save user data after all steps are complete
        await saveUserData(userData);
        
        // Send completion message
        await sendTranslatedMessage(
          business_phone_number_id, 
          userPhone, 
          ONBOARDING_STEPS.LANGUAGE.message,
          userData.language,
          messageId
        );
        
        // Clear onboarding state
        userStates.delete(userPhone);
        
        // No need to proceed further
        return;
    }
    
    // Get the next step
    const nextStep = ONBOARDING_STEPS[currentStep].nextStep;
    
    // If there is a next step, update state and send next message
    if (nextStep) {
      userState.currentStep = nextStep;
      
      // Use interactive options for specific steps
      if (nextStep === 'DIABETES_TYPE') {
        // Present diabetes type options with buttons
        const diabetesButtons = [
          { id: "type1", text: { en: "Type 1", hi: "टाइप 1" } },
          { id: "type2", text: { en: "Type 2", hi: "टाइप 2" } },
          { id: "none", text: { en: "None", hi: "कोई नहीं" } }
        ];
        
        await sendButtonMessage(
          business_phone_number_id,
          userPhone,
          { en: "Diabetes Type", hi: "मधुमेह प्रकार" },
          { en: "What type of diabetes do you have?", hi: "आपको किस प्रकार का मधुमेह है?" },
          diabetesButtons,
          userLang,
          messageId
        );
        
        // Update state to indicate we're expecting a button response
        userState.expectingButtonForDiabetes = true;
      } 
      else if (nextStep === 'TRACK_BLOOD_SUGAR') {
        // Present yes/no options with buttons
        const yesNoButtons = [
          { id: "yes_blood_sugar", text: { en: "Yes", hi: "हां" } },
          { id: "no_blood_sugar", text: { en: "No", hi: "नहीं" } }
        ];
        
        await sendButtonMessage(
          business_phone_number_id,
          userPhone,
          { en: "Blood Sugar Tracking", hi: "रक्त शर्करा ट्रैकिंग" },
          { en: "Do you want to track your blood sugar levels?", hi: "क्या आप अपने रक्त शर्करा के स्तर को ट्रैक करना चाहते हैं?" },
          yesNoButtons,
          userLang,
          messageId
        );
        
        // Update state to indicate we're expecting a button response
        userState.expectingButtonForBloodSugar = true;
      }
      else if (nextStep === 'LANGUAGE') {
        // Present language options with buttons
        const languageButtons = [
          { id: "lang_en", text: { en: "English", hi: "अंग्रेजी" } },
          { id: "lang_hi", text: { en: "Hindi", hi: "हिंदी" } }
        ];
        
        await sendButtonMessage(
          business_phone_number_id,
          userPhone,
          { en: "Language Preference", hi: "भाषा प्राथमिकता" },
          { en: "What is your preferred language?", hi: "आपकी पसंदीदा भाषा क्या है?" },
          languageButtons,
          userLang,
          messageId
        );
        
        // Update state to indicate we're expecting a button response
        userState.expectingButtonForLanguage = true;
      }
      else {
        // Use regular text message for other steps
        await sendTranslatedMessage(
          business_phone_number_id, 
          userPhone, 
          ONBOARDING_STEPS[nextStep].message,
          userLang,
          messageId
        );
      }
    }
  } catch (error) {
    console.error('Error handling onboarding step:', error);
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      {
        en: "Sorry, there was an error processing your information. Please try again later.",
        hi: "क्षमा करें, आपकी जानकारी प्रोसेस करने में एक त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
      },
      userData?.language || 'en',
      messageId
    );
    // Clear state on error
    userStates.delete(userPhone);
  }
}

// Helper functions for blood sugar logging

// Handle blood sugar type selection
async function handleBloodSugarTypeSelection(business_phone_number_id, userPhone, messageText, messageId) {
  let bloodSugarType;
  
  switch (messageText.trim()) {
    case '1':
      bloodSugarType = BLOOD_SUGAR_TYPES.FASTING;
      break;
    case '2':
      bloodSugarType = BLOOD_SUGAR_TYPES.POST_MEAL;
      break;
    case '3':
      bloodSugarType = BLOOD_SUGAR_TYPES.RANDOM;
      break;
    default:
      await sendTranslatedMessage(
        business_phone_number_id, 
        userPhone, 
        "Invalid selection. Please enter 1, 2, or 3 to select a blood sugar reading type.",
        'en',
        messageId
      );
      return;
  }
  
  // Update state to wait for blood sugar value
  userStates.set(userPhone, { 
    waitingForBloodSugarValue: true,
    bloodSugarType: bloodSugarType
  });
  
  // Ask for the blood sugar value
  await sendTranslatedMessage(
    business_phone_number_id, 
    userPhone, 
    "Please enter your blood sugar value (in mg/dL):",
    'en',
    messageId
  );
}

// Helper function to set up blood sugar logging table
async function setupBloodSugarTable() {
  try {
    console.log('Checking if blood_sugar_logs table exists...');
    
    // First check if the table already exists
    const { error: checkError } = await supabase
      .from('blood_sugar_logs')
      .select('id')
      .limit(1);
    
    // If no error, table exists
    if (!checkError) {
      console.log('blood_sugar_logs table already exists');
      return true;
    }
    
    // If error is not about missing table, something else is wrong
    if (checkError.code !== '42P01' && 
        !(checkError.message && checkError.message.includes('relation') && 
          checkError.message.includes('does not exist'))) {
      console.error('Unexpected error checking blood_sugar_logs table:', checkError);
      return false;
    }
    
    console.log('blood_sugar_logs table does not exist, creating it now...');
    
    // Create the table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS blood_sugar_logs (
        id SERIAL PRIMARY KEY,
        user_phone TEXT NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
        value NUMERIC NOT NULL,
        type TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        notes TEXT,
        related_meal_id INTEGER REFERENCES food_entries(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS blood_sugar_user_idx ON blood_sugar_logs(user_phone);
      CREATE INDEX IF NOT EXISTS blood_sugar_timestamp_idx ON blood_sugar_logs(timestamp);
      CREATE INDEX IF NOT EXISTS blood_sugar_type_idx ON blood_sugar_logs(type);
    `;
    
    // Execute the SQL using Supabase's rpc function for raw SQL
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    
    if (createError) {
      console.error('Error creating blood_sugar_logs table:', createError);
      
      // If the rpc function doesn't exist, inform the developer
      if (createError.message && createError.message.includes('function exec_sql') && 
          createError.message.includes('does not exist')) {
        console.error('The exec_sql function does not exist in your Supabase project.');
        console.error('Please run the migration script manually: migrations/add_blood_sugar_table.sql');
      }
      
      return false;
    }
    
    console.log('Successfully created blood_sugar_logs table!');
    return true;
  } catch (error) {
    console.error('Error in setupBloodSugarTable:', error);
    return false;
  }
}

// Add column to users table for blood sugar tracking preference
async function ensureUserTableHasBloodSugarColumn() {
  try {
    // Check if the column exists by trying to select it
    const { error: columnCheckError } = await supabase
      .from('users')
      .select('track_blood_sugar')
      .limit(1);
    
    // If no error, column exists
    if (!columnCheckError) {
      return true;
    }
    
    console.log('Adding track_blood_sugar column to users table...');
    
    // Add the column using rpc function
    const alterTableSQL = `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS track_blood_sugar BOOLEAN DEFAULT FALSE;
    `;
    
    const { error: alterError } = await supabase.rpc('exec_sql', { sql: alterTableSQL });
    
    if (alterError) {
      console.error('Error adding track_blood_sugar column:', alterError);
      return false;
    }
    
    console.log('Successfully added track_blood_sugar column to users table!');
    return true;
  } catch (error) {
    console.error('Error in ensureUserTableHasBloodSugarColumn:', error);
    return false;
  }
}

// Handle blood sugar value input
async function handleBloodSugarValueInput(business_phone_number_id, userPhone, messageText, userState, messageId) {
  // Trim and validate input
  const input = messageText.trim();
  
  // Early validation for empty input
  if (!input) {
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      "You didn't enter any value. Please enter your blood sugar reading as a number in mg/dL.",
      'en',
      messageId
    );
    return;
  }
  
  // Try to parse the blood sugar value
  const bloodSugarValue = parseFloat(input);
  
  // Check if the input is a valid number
  if (isNaN(bloodSugarValue)) {
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      `"${input}" is not a valid number. Please enter only digits for your blood sugar value in mg/dL.`,
      'en',
      messageId
    );
    return;
  }
  
  // Validate the blood sugar value range
  if (bloodSugarValue < 10 || bloodSugarValue > 600) {
    let errorMessage = `The blood sugar value ${bloodSugarValue} mg/dL seems outside the normal range.`;
    
    if (bloodSugarValue < 10) {
      errorMessage += " Blood sugar values are rarely below 10 mg/dL. Please verify your reading or add a decimal point if needed.";
    } else {
      errorMessage += " Blood sugar values are rarely above 600 mg/dL. If this reading is correct, please seek medical attention immediately.";
    }
    
    errorMessage += "\n\nDo you want to try again? Type 'log blood sugar' to restart.";
    
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      errorMessage,
      'en',
      messageId
    );
    
    // Clear the state
    userStates.delete(userPhone);
    return;
  }
  
  try {
    // Get the selected blood sugar type from state
    const bloodSugarType = userState.bloodSugarType;
    
    if (!bloodSugarType || !Object.values(BLOOD_SUGAR_TYPES).includes(bloodSugarType)) {
      throw new Error(`Invalid blood sugar type: ${bloodSugarType}. Please restart the process.`);
    }
    
    // Try to log the blood sugar reading
    try {
      const logResult = await logBloodSugar(userPhone, bloodSugarValue, bloodSugarType);
      
      // If we get here, logging was successful
      // Prepare response based on blood sugar type and value
      let response = `Blood sugar reading (${bloodSugarValue} mg/dL) logged successfully.\n\n`;
      
      // Add interpretation based on type and value
      if (bloodSugarType === BLOOD_SUGAR_TYPES.FASTING) {
        response += "⚠️ Your fasting blood sugar is below the normal range (70-100 mg/dL). This could indicate hypoglycemia.";
      } else if (bloodSugarType === BLOOD_SUGAR_TYPES.POST_MEAL) {
        response += "⚠️ Your post-meal blood sugar is too low. Consider consulting your healthcare provider.";
      } else {
        // Random reading
        response += "⚠️ Your blood sugar is below 70 mg/dL, which may indicate hypoglycemia.";
      }
      
      // Add a note about trends
      response += "\n\nType 'blood sugar trends' to see your overall patterns.";
      
      // Add ad link
      response += `\n\n${AD_LINK}`;
      
      await sendTranslatedMessage(business_phone_number_id, userPhone, response, 'en', messageId);
    } catch (logError) {
      // If the error indicates the table doesn't exist, try to create it
      if (logError.message && (
          logError.message.includes('table does not exist') || 
          logError.message.includes('relation') || 
          logError.message.includes('blood sugar logs table'))) {
        
        // Send a message to the user that we're setting up the feature
        await sendTranslatedMessage(
          business_phone_number_id,
          userPhone,
          "Setting up blood sugar tracking feature for the first time. This may take a moment...",
          'en',
          messageId
        );
        
        // Try to set up the table
        const tableSetupSuccess = await setupBloodSugarTable();
        const columnSetupSuccess = await ensureUserTableHasBloodSugarColumn();
        
        if (tableSetupSuccess && columnSetupSuccess) {
          // Retry logging the blood sugar
          try {
            const retryResult = await logBloodSugar(userPhone, bloodSugarValue, bloodSugarType);
            
            // Success! Send success message
            let response = `Blood sugar reading (${bloodSugarValue} mg/dL) logged successfully.\n\n`;
            response += "Blood sugar tracking feature has been set up successfully!\n\n";
            
            // Add interpretation based on value
            if (bloodSugarValue < 70) {
              response += "⚠️ Your blood sugar is below 70 mg/dL, which may indicate hypoglycemia.";
            } else if (bloodSugarValue <= 140) {
              response += "✅ Your blood sugar is within a generally acceptable range.";
            } else {
              response += "⚠️ Your blood sugar is elevated. Consider checking again later.";
            }
            
            // Add ad link
            response += `\n\n${AD_LINK}`;
            
            await sendTranslatedMessage(business_phone_number_id, userPhone, response, 'en', messageId);
          } catch (retryError) {
            // Still failed after creating the table
            console.error('Error logging blood sugar after creating table:', retryError);
            await sendTranslatedMessage(
              business_phone_number_id,
              userPhone,
              "The blood sugar tracking feature was set up, but there was still an error logging your reading. Please try again by typing 'log blood sugar'.",
              'en',
              messageId
            );
          }
        } else {
          // Failed to set up the table
          await sendTranslatedMessage(
            business_phone_number_id,
            userPhone,
            "Sorry, there was an error setting up the blood sugar tracking feature. Please contact support for assistance.",
            'en',
            messageId
          );
        }
      } else {
        // Rethrow the original error for the outer catch block to handle
        throw logError;
      }
    }
  } catch (error) {
    console.error('Error logging blood sugar:', error);
    
    // Prepare a user-friendly error message based on the specific error
    let errorMessage = "Sorry, there was an error logging your blood sugar reading.";
    let developerNote = '';
    
    // Extract the specific error message if available
    if (error && error.message) {
      // Check for database setup errors first
      if (error.message.includes('table does not exist') || 
          error.message.includes('relation') || 
          error.message.includes('blood sugar logs table')) {
        errorMessage = "The blood sugar tracking feature is not fully set up yet.";
        developerNote = "\n\nDEVELOPER NOTE: You need to run the database migration script to create the blood_sugar_logs table. See migrations/add_blood_sugar_table.sql";
      }
      // Handle specific error types with friendly messages
      else if (error.message.includes('too low')) {
        errorMessage = `⚠️ ${error.message} Please check your reading and try again.`;
      } else if (error.message.includes('too high')) {
        errorMessage = `⚠️ ${error.message}`;
      } else if (error.message.includes('Database error')) {
        errorMessage = "There was a problem connecting to the database. Please try again later.";
        developerNote = `\n\nDEVELOPER NOTE: Database error details: ${error.message}`;
      } else {
        // Include the actual error for other cases, but make it user-friendly
        errorMessage += " There was a problem processing your request.";
        developerNote = `\n\nDEVELOPER NOTE: Error details: ${error.message}`;
      }
    }
    
    // Add suggestion for user
    errorMessage += "\n\nType 'log blood sugar' to try again.";
    
    // Only add developer note in non-production environments
    if (process.env.NODE_ENV !== 'production' && developerNote) {
      errorMessage += developerNote;
    }
    
    // Add ad link
    errorMessage += `\n\n${AD_LINK}`;
    
    await sendTranslatedMessage(
      business_phone_number_id, 
      userPhone, 
      errorMessage,
      'en',
      messageId
    );
  } finally {
    // Clear the state
    userStates.delete(userPhone);
  }
}

// Function to save user data to database
async function saveUserData(userData) {
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('phone_number')
      .eq('phone_number', userData.phone_number)
      .single();
    
    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: userData.name,
          diabetes_type: userData.diabetes_type,
          daily_limit: userData.daily_limit,
          preferences: userData.preferences,
          track_blood_sugar: userData.track_blood_sugar,
          language: userData.language,
          onboarded: userData.onboarded,
          last_active: formatTimestampForPostgres(new Date())
        })
        .eq('phone_number', userData.phone_number);
      
      if (updateError) throw updateError;
    } else {
      // Insert new user
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          phone_number: userData.phone_number,
          name: userData.name,
          diabetes_type: userData.diabetes_type,
          daily_limit: userData.daily_limit,
          preferences: userData.preferences,
          track_blood_sugar: userData.track_blood_sugar,
          language: userData.language,
          onboarded: userData.onboarded,
          created_at: formatTimestampForPostgres(new Date()),
          last_active: formatTimestampForPostgres(new Date())
        }]);
      
      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

// Helper function to send interactive button message
async function sendButtonMessage(business_phone_number_id, to, headerText, bodyText, buttons, lang, contextMessageId) {
  // Translate header and body text if they're strings
  const translatedHeader = typeof headerText === 'object' 
    ? (headerText[lang] || headerText['en']) 
    : await getTranslation(headerText, lang);
  
  const translatedBody = typeof bodyText === 'object' 
    ? (bodyText[lang] || bodyText['en']) 
    : await getTranslation(bodyText, lang);
  
  // Translate button texts - WhatsApp allows maximum 3 buttons
  const translatedButtons = [];
  for (let i = 0; i < Math.min(buttons.length, 3); i++) {
    const button = buttons[i];
    const buttonTitle = typeof button.text === 'object'
      ? (button.text[lang] || button.text['en'])
      : await getTranslation(button.text, lang);
    
    // Button title must be 20 chars or less
    const truncatedTitle = buttonTitle.length > 20 ? buttonTitle.substring(0, 17) + '...' : buttonTitle;
      
    translatedButtons.push({
      type: "reply",
      reply: {
        id: button.id,
        title: truncatedTitle
      }
    });
  }
  
  // Header text must be 60 chars or less
  const truncatedHeader = translatedHeader.length > 60 ? translatedHeader.substring(0, 57) + '...' : translatedHeader;
  
  // Body text must be 1024 chars or less
  const truncatedBody = translatedBody.length > 1024 ? translatedBody.substring(0, 1021) + '...' : translatedBody;
  
  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: truncatedHeader
      },
      body: {
        text: truncatedBody
      },
      action: {
        buttons: translatedButtons
      }
    }
  };
  
  // Add context if provided
  if (contextMessageId) {
    data.context = {
      message_id: contextMessageId
    };
  }
  
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
      headers: {
        "Authorization": `Bearer ${GRAPH_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: data
    });
  } catch (error) {
    console.error("Error sending button message:", error.response?.data || error.message);
    // Fall back to regular message if interactive message fails
    let fallbackMessage = `${truncatedHeader}\n\n${truncatedBody}\n\n`;
    buttons.forEach((button, index) => {
      const buttonTitle = typeof button.text === 'object'
        ? (button.text[lang] || button.text['en'])
        : button.text;
      fallbackMessage += `${index + 1}. ${buttonTitle}\n`;
    });
    
    await sendTranslatedMessage(business_phone_number_id, to, fallbackMessage, lang);
  }
}

// Helper function to send interactive list message
async function sendListMessage(business_phone_number_id, to, headerText, bodyText, buttonText, sections, lang, contextMessageId) {
  // Translate header and body text
  const translatedHeader = typeof headerText === 'object' 
    ? (headerText[lang] || headerText['en']) 
    : await getTranslation(headerText, lang);
  
  const translatedBody = typeof bodyText === 'object' 
    ? (bodyText[lang] || bodyText['en']) 
    : await getTranslation(bodyText, lang);
  
  const translatedButtonText = typeof buttonText === 'object' 
    ? (buttonText[lang] || buttonText['en']) 
    : await getTranslation(buttonText, lang);
  
  // Translate sections
  const translatedSections = [];
  for (const section of sections) {
    const sectionTitle = typeof section.title === 'object'
      ? (section.title[lang] || section.title['en'])
      : await getTranslation(section.title, lang);
    
    const translatedRows = [];
    for (const row of section.rows) {
      const rowTitle = typeof row.title === 'object'
        ? (row.title[lang] || row.title['en'])
        : await getTranslation(row.title, lang);
      
      let rowDescription = undefined;
      if (row.description) {
        rowDescription = typeof row.description === 'object'
          ? (row.description[lang] || row.description['en'])
          : await getTranslation(row.description, lang);
      }
      
      // Row titles must be 24 chars or less
      const truncatedTitle = rowTitle.length > 24 ? rowTitle.substring(0, 21) + '...' : rowTitle;
      
      // Row descriptions must be 72 chars or less
      const truncatedDescription = rowDescription && rowDescription.length > 72 ? 
        rowDescription.substring(0, 69) + '...' : rowDescription;
      
      translatedRows.push({
        id: row.id,
        title: truncatedTitle,
        description: truncatedDescription
      });
    }
    
    // Section titles must be 24 chars or less
    const truncatedSectionTitle = sectionTitle.length > 24 ? 
      sectionTitle.substring(0, 21) + '...' : sectionTitle;
    
    translatedSections.push({
      title: truncatedSectionTitle,
      rows: translatedRows.slice(0, 10) // Max 10 rows per section
    });
  }
  
  // Header text must be 60 chars or less
  const truncatedHeader = translatedHeader.length > 60 ? 
    translatedHeader.substring(0, 57) + '...' : translatedHeader;
  
  // Body text must be 1024 chars or less
  const truncatedBody = translatedBody.length > 1024 ? 
    translatedBody.substring(0, 1021) + '...' : translatedBody;
  
  // Button text must be 20 chars or less
  const truncatedButtonText = translatedButtonText.length > 20 ? 
    translatedButtonText.substring(0, 17) + '...' : translatedButtonText;
  
  const data = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: truncatedHeader
      },
      body: {
        text: truncatedBody
      },
      action: {
        button: truncatedButtonText,
        sections: translatedSections.slice(0, 10) // Max 10 sections
      }
    }
  };
  
  // Add context if provided
  if (contextMessageId) {
    data.context = {
      message_id: contextMessageId
    };
  }
  
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v22.0/${business_phone_number_id}/messages`,
      headers: {
        "Authorization": `Bearer ${GRAPH_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: data
    });
  } catch (error) {
    console.error("Error sending list message:", error.response?.data || error.message);
    // Fall back to regular message if interactive message fails
    let fallbackMessage = `${truncatedHeader}\n\n${truncatedBody}\n\n`;
    sections.forEach(section => {
      const sectionTitle = typeof section.title === 'object'
        ? (section.title[lang] || section.title['en'])
        : section.title;
      fallbackMessage += `== ${sectionTitle} ==\n`;
      
      section.rows.forEach((row, index) => {
        const rowTitle = typeof row.title === 'object'
          ? (row.title[lang] || row.title['en'])
          : row.title;
        fallbackMessage += `${index + 1}. ${rowTitle}\n`;
      });
      fallbackMessage += '\n';
    });
    
    await sendTranslatedMessage(business_phone_number_id, to, fallbackMessage, lang);
  }
}
