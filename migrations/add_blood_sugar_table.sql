-- Add track_blood_sugar column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS track_blood_sugar BOOLEAN DEFAULT FALSE;

-- Create blood_sugar_logs table
CREATE TABLE IF NOT EXISTS blood_sugar_logs (
  id SERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
  value NUMERIC NOT NULL, -- blood sugar value in mg/dL
  type TEXT NOT NULL, -- 'fasting', 'post_meal', or 'random'
  timestamp TIMESTAMP NOT NULL,
  notes TEXT,
  related_meal_id INTEGER REFERENCES food_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS blood_sugar_user_idx ON blood_sugar_logs(user_phone);
CREATE INDEX IF NOT EXISTS blood_sugar_timestamp_idx ON blood_sugar_logs(timestamp);
CREATE INDEX IF NOT EXISTS blood_sugar_type_idx ON blood_sugar_logs(type);

-- Create view for correlating food entries with blood sugar readings
CREATE OR REPLACE VIEW meal_blood_sugar_correlation AS
SELECT 
  f.id AS meal_id,
  f.user_phone,
  f.timestamp AS meal_timestamp,
  f.calories,
  f.user_provided_details,
  f.is_recommended,
  bs.id AS blood_sugar_id,
  bs.value AS blood_sugar_value,
  bs.timestamp AS blood_sugar_timestamp,
  bs.type AS blood_sugar_type,
  EXTRACT(EPOCH FROM (bs.timestamp - f.timestamp))/60 AS minutes_after_meal
FROM food_entries f
LEFT JOIN blood_sugar_logs bs ON 
  f.user_phone = bs.user_phone AND
  bs.timestamp > f.timestamp AND
  bs.timestamp < f.timestamp + INTERVAL '3 hours' AND
  bs.type = 'post_meal'
WHERE bs.id IS NOT NULL
ORDER BY f.timestamp DESC;

-- Add comments to the tables and columns for documentation
COMMENT ON TABLE blood_sugar_logs IS 'Stores user blood sugar readings';
COMMENT ON COLUMN blood_sugar_logs.value IS 'Blood sugar value in mg/dL';
COMMENT ON COLUMN blood_sugar_logs.type IS 'Type of reading: fasting, post_meal, or random';
COMMENT ON COLUMN blood_sugar_logs.related_meal_id IS 'Optional reference to associated meal';

COMMENT ON VIEW meal_blood_sugar_correlation IS 'Correlates meals with post-meal blood sugar readings within 3 hours'; 