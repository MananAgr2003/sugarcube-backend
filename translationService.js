/**
 * Translation service for multilingual support
 * Currently supports English (en) and Hindi (hi)
 */

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'hi'];

// Common translations for frequently used phrases
const translations = {
  // Blood sugar related
  "Please enter your blood sugar value (in mg/dL):": {
    hi: "कृपया अपने रक्त शर्करा का मान दर्ज करें (mg/dL में):"
  },
  "Blood sugar reading logged successfully.": {
    hi: "रक्त शर्करा रीडिंग सफलतापूर्वक लॉग की गई।"
  },
  "Your fasting blood sugar is below the normal range (70-100 mg/dL). This could indicate hypoglycemia.": {
    hi: "आपका उपवास रक्त शर्करा सामान्य सीमा (70-100 mg/dL) से कम है। यह हाइपोग्लाइसीमिया का संकेत हो सकता है।"
  },
  "Your fasting blood sugar is within the normal range (70-100 mg/dL).": {
    hi: "आपका उपवास रक्त शर्करा सामान्य सीमा (70-100 mg/dL) के भीतर है।"
  },
  "Your fasting blood sugar is in the prediabetic range (100-125 mg/dL).": {
    hi: "आपका उपवास रक्त शर्करा पूर्व-मधुमेह की सीमा (100-125 mg/dL) में है।"
  },
  "Your fasting blood sugar is above 125 mg/dL, which is in the diabetic range.": {
    hi: "आपका उपवास रक्त शर्करा 125 mg/dL से अधिक है, जो मधुमेह की सीमा में है।"
  },
  "Your post-meal blood sugar is too low. Consider consulting your healthcare provider.": {
    hi: "आपका भोजन के बाद का रक्त शर्करा बहुत कम है। अपने स्वास्थ्य देखभाल प्रदाता से परामर्श करने पर विचार करें।"
  },
  "Your post-meal blood sugar is within the normal range (less than 140 mg/dL).": {
    hi: "आपका भोजन के बाद का रक्त शर्करा सामान्य सीमा (140 mg/dL से कम) के भीतर है।"
  },
  "Your post-meal blood sugar is slightly elevated.": {
    hi: "आपका भोजन के बाद का रक्त शर्करा थोड़ा बढ़ा हुआ है।"
  },
  "Your post-meal blood sugar is above 180 mg/dL, which is higher than recommended.": {
    hi: "आपका भोजन के बाद का रक्त शर्करा 180 mg/dL से अधिक है, जो अनुशंसित से अधिक है।"
  },
  "Your blood sugar is below 70 mg/dL, which may indicate hypoglycemia.": {
    hi: "आपका रक्त शर्करा 70 mg/dL से कम है, जो हाइपोग्लाइसीमिया का संकेत हो सकता है।"
  },
  "Your blood sugar is within a generally acceptable range.": {
    hi: "आपका रक्त शर्करा आमतौर पर स्वीकार्य सीमा के भीतर है।"
  },
  "Your blood sugar is elevated. Consider checking again later.": {
    hi: "आपका रक्त शर्करा बढ़ा हुआ है। बाद में फिर से जांच करने पर विचार करें।"
  },
  "Type 'blood sugar trends' to see your overall patterns.": {
    hi: "अपने समग्र पैटर्न देखने के लिए 'blood sugar trends' टाइप करें।"
  },
  "Invalid selection. Please enter 1, 2, or 3 to select a blood sugar reading type.": {
    hi: "अमान्य चयन। रक्त शर्करा रीडिंग प्रकार चुनने के लिए कृपया 1, 2, या 3 दर्ज करें।"
  },
  
  // Food analysis related
  "Do you want to add details for the recipe? Please provide any additional information about ingredients, cooking method, or portion size.": {
    hi: "क्या आप रेसिपी के लिए विवरण जोड़ना चाहते हैं? कृपया सामग्री, पकाने की विधि, या हिस्से के आकार के बारे में कोई अतिरिक्त जानकारी प्रदान करें।"
  },
  "Sorry, there was an error processing your image.": {
    hi: "क्षमा करें, आपकी छवि को संसाधित करने में त्रुटि हुई।"
  },
  "Sorry, there was an error processing your food entry. Please try again later.": {
    hi: "क्षमा करें, आपकी खाद्य प्रविष्टि को संसाधित करने में त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
  },
  "Calorie estimate:": {
    hi: "कैलोरी अनुमान:"
  },
  "Recommendation:": {
    hi: "अनुशंसा:"
  },
  "Good choice!": {
    hi: "अच्छा विकल्प!"
  },
  "Not recommended": {
    hi: "अनुशंसित नहीं"
  },
  "Reason:": {
    hi: "कारण:"
  },
  "Personalized advice:": {
    hi: "व्यक्तिगत सलाह:"
  },
  "Today's Summary:": {
    hi: "आज का सारांश:"
  },
  "Total Calories:": {
    hi: "कुल कैलोरी:"
  },
  "Meals:": {
    hi: "भोजन:"
  },
  "Good Choices:": {
    hi: "अच्छे विकल्प:"
  },
  "Caution Needed:": {
    hi: "सावधानी आवश्यक:"
  },
  
  // Error messages
  "Invalid choice. Please type 'summary' to try again.": {
    hi: "अमान्य विकल्प। कृपया फिर से कोशिश करने के लिए 'summary' टाइप करें।"
  },
  "Sorry, there was an error processing your summary request. Please try again later.": {
    hi: "क्षमा करें, आपके सारांश अनुरोध को संसाधित करने में त्रुटि हुई। कृपया बाद में पुनः प्रयास करें।"
  },
  "Sorry, there was an error fetching your blood sugar trends.": {
    hi: "क्षमा करें, आपके रक्त शर्करा के रुझान प्राप्त करने में त्रुटि हुई।"
  },
  "You didn't enter any value. Please enter your blood sugar reading as a number in mg/dL.": {
    hi: "आपने कोई मान दर्ज नहीं किया। कृपया अपनी रक्त शर्करा रीडिंग को mg/dL में एक संख्या के रूप में दर्ज करें।"
  }
};

/**
 * Get translation for a given text in the specified language
 * @param {string|object} text - Text to translate or object with translations
 * @param {string} targetLang - Target language code
 * @returns {string} - Translated text
 */
export async function getTranslation(text, targetLang = 'en') {
  // If language not supported, return English
  if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
    targetLang = 'en';
  }
  
  // If the target language is English, just return the original text
  if (targetLang === 'en') {
    if (typeof text === 'object' && text.en) {
      return text.en;
    }
    return text;
  }
  
  // If text is already a translation object, return the appropriate translation
  if (typeof text === 'object') {
    return text[targetLang] || text.en || '';
  }
  
  // Look up translation in the dictionary
  if (translations[text] && translations[text][targetLang]) {
    return translations[text][targetLang];
  }
  
  // If no translation found, return original text
  return text;
} 