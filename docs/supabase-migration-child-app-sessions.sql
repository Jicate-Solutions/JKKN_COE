-- Create child_app_user_sessions table for tracking child app sessions
CREATE TABLE IF NOT EXISTS child_app_user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    app_id VARCHAR(255) NOT NULL,
    session_token TEXT,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add indexes for better query performance
CREATE INDEX idx_child_app_sessions_user_id ON child_app_user_sessions(user_id);
CREATE INDEX idx_child_app_sessions_app_id ON child_app_user_sessions(app_id);
CREATE INDEX idx_child_app_sessions_last_activity ON child_app_user_sessions(last_activity_at DESC);
CREATE INDEX idx_child_app_sessions_composite ON child_app_user_sessions(user_id, app_id, last_activity_at DESC);

-- Enable Row Level Security
ALTER TABLE child_app_user_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for reading sessions (authenticated users can read their own sessions)
CREATE POLICY "Users can view their own sessions" ON child_app_user_sessions
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Policy for inserting sessions (authenticated users can create their own sessions)
CREATE POLICY "Users can create their own sessions" ON child_app_user_sessions
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Policy for updating sessions (authenticated users can update their own sessions)
CREATE POLICY "Users can update their own sessions" ON child_app_user_sessions
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Policy for service role (full access)
CREATE POLICY "Service role has full access" ON child_app_user_sessions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_child_app_user_sessions_updated_at
    BEFORE UPDATE ON child_app_user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old sessions (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_child_app_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM child_app_user_sessions
    WHERE last_activity_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up old sessions
-- (This requires pg_cron extension to be enabled)
-- SELECT cron.schedule('cleanup-child-app-sessions', '0 0 * * *', 'SELECT cleanup_old_child_app_sessions();');