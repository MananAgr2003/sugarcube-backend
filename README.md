# WhatsApp Platform Quick Start

Welcome to your first step toward building awesome WhatsApp apps!

This project contains the code for a simple webhook you can use to get started using the WhatsApp Platform.

The code here mirrors what is in our [webhook set up guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks), and may be used as the starting point for doing the ["Get Started With the WhatsApp Business Cloud API guide"](https://developers.facebook.com/docs/whatsapp/getting-started/signing-up/).

## Additional Resources

Interested in learning more about the WhatsApp Platform?

Check out these resources:

- [**Webhook set up guide**](https://developers.facebook.com/docs/whatsapp/getting-started/signing-up/#configure-webhooks): The walkthrough for the code in this project.

- [**Quick start tutorial**](https://developers.facebook.com/docs/whatsapp/getting-started/signing-up/): Build your first app by remixing this project and following our quick start tutorial.

- [**WhatsApp Business Platform Documentation**](https://developers.facebook.com/docs/whatsapp/)


## Environment Setup

1. Create an account on Glitch to have access to all features mentioned here.
2. Remix this project on Glitch.
3. Click on the file `.env` on the left sidebar, and set these environment variables

- `WEBHOOK_VERIFY_TOKEN`: You can use any string and use the same when setting up the webhook in your app in the following steps.
- `GRAPH_API_TOKEN`: You can get a **Temporary access token** from the dashboard of your app on **Meta for Developers** when you click **API Setup** under the **WhatsApp** section on the left navigation pane.

4. Get the new Glitch URL to use as your webhook, eg: `https://project-name.glitch.me/webhook`. You can find the base URL by clicking on **Share** on top right in Glitch, copy the **Live Site** URL, then add `/webhook` to it.
5. Subscribe the webhook URL in the dashboard of your app on **Meta for Developers**. Click the **Configuration** menu under **WhatsApp** in the left navigation pane.
   In the **Webhook** section, click **Edit** and paste your webhook URL from the previous step. For the **Verify token** field, use the `VERIFY_TOKEN` value in your .env file, then click **Verify and save**.
   Under the **Webhook fields** section click **Manage** and make sure **messages** field is selected.
6. Edit `server.js` to change the webhook logic as needed.
7. Click on the **Logs** tab at the bottom to view server logs. The logs section also has a button to attach a debugger via Chrome devtools.

# WhatsApp Health Tracking Bot

A WhatsApp bot for tracking health metrics, food intake, and blood sugar levels.

## Interactive Messages

The application now uses WhatsApp's interactive message features for better user experience:

- **Button Messages**: Quick option selection with buttons for language selection, blood sugar types, etc.
- **List Messages**: Scrollable lists for viewing available commands, summary options, and other multi-choice options.

Users can simply tap on their preferred option rather than typing commands or numbers, making the bot more user-friendly.

## Multilingual Support

The application supports both English and Hindi languages. Users can select their preferred language during onboarding or change it at any time by typing 'language' or 'change language'.

## Database Migration

### Adding Language Support

To add language support to your existing database, run the following SQL script:

```sql
-- From the migrations/add_language_column.sql file
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
COMMENT ON COLUMN users.language IS 'User preferred language code (en for English, hi for Hindi, etc.)';
CREATE INDEX IF NOT EXISTS users_language_idx ON users(language);
UPDATE users SET language = 'en' WHERE language IS NULL;
```

You can run this script using the Supabase SQL editor or using a database client that can connect to your Supabase PostgreSQL database.

## Getting Started

1. Clone this repository
2. Install dependencies with `npm install`
3. Set up your environment variables in `.env`
4. Run the migrations to set up your database
5. Start the server with `npm start`
