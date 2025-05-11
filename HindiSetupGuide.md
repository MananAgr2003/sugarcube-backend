# Setting Up Hindi Language for WhatsApp Health Tracking Bot

This guide explains how to set up and use the Health Tracking Bot in Hindi.

## Method 1: During Onboarding (New Users)

When you first start using the bot or during the onboarding process, you'll be asked to select your preferred language:

1. Start the conversation with the bot by sending "start onboarding" or "update profile"
2. Follow the onboarding steps (name, diabetes type, daily calorie limit, etc.)
3. When you reach the language preference step, respond with "hi" or "hindi" or "हिंदी"
4. Complete the remaining onboarding steps
5. The bot will now communicate with you in Hindi!

## Method 2: Using the Language Command (Any Time)

You can change your language preference at any time:

1. Send "language" or "change language" to the bot
2. You'll receive a message with buttons to select your language
3. Tap the "हिंदी" button
4. The bot will confirm your language change and switch to Hindi

## Method 3: Manual Database Setup (Administrator)

If you're an administrator and want to set Hindi as the default language for a user:

1. Access your Supabase database
2. Navigate to the "users" table
3. Find the user's record by phone number
4. Set the "language" field to "hi"
5. Save the changes

## Verifying Hindi Setup

To verify that Hindi is correctly set up:

1. Send a command like "help" (सहायता)
2. The bot should respond in Hindi
3. All interactive menus, buttons, and messages should appear in Hindi

## Supported Commands in Hindi

Here are the key commands you can use in Hindi:

- सहायता - To see the help menu
- प्रोफाइल अपडेट करें - To update your profile
- सारांश - To see your health summary 
- रक्त शर्करा - To log blood sugar
- रक्त शर्करा रुझान - To see blood sugar trends
- भाषा बदलें - To change language

## Troubleshooting Hindi Language Issues

If you encounter problems with Hindi language:

1. **Characters Not Displaying**: Make sure your device supports Hindi Unicode characters
2. **Still Getting English**: Verify that your language preference is set to "hi" in the database
3. **Partial Translation**: Some specialized medical terms might still appear in English
4. **Interactive Buttons Not Working**: Try the text command alternatives

## Contact Support

If you continue to have issues with Hindi language support, please contact the administrator for assistance. 