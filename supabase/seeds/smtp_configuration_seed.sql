-- SMTP Configuration Sample Data
-- Run this after the examiners migration has been applied

-- Sample SMTP configuration for JKKN institution
-- NOTE: Replace 'your_encrypted_password_here' with actual encrypted password in production

INSERT INTO smtp_configuration (
    institution_code,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_password_encrypted,
    sender_email,
    sender_name,
    default_cc_emails,
    is_active
) VALUES
(
    'JKKN001',
    'smtp.gmail.com',
    587,
    true,
    'coe@jkkn.edu.in',
    'encrypted_password_placeholder', -- Replace with actual encrypted password
    'coe@jkkn.edu.in',
    'Controller of Examinations - JKKN',
    ARRAY['principal@jkkn.edu.in', 'deputy.coe@jkkn.edu.in'],
    true
)
ON CONFLICT DO NOTHING;

-- Additional sample for testing (Office 365)
INSERT INTO smtp_configuration (
    institution_code,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_password_encrypted,
    sender_email,
    sender_name,
    default_cc_emails,
    is_active
) VALUES
(
    'JKKN002',
    'smtp.office365.com',
    587,
    true,
    'examinations@jkkncollege.edu.in',
    'encrypted_password_placeholder', -- Replace with actual encrypted password
    'examinations@jkkncollege.edu.in',
    'Office of Controller of Examinations',
    ARRAY['admin@jkkncollege.edu.in'],
    false -- Set to inactive as backup config
)
ON CONFLICT DO NOTHING;
