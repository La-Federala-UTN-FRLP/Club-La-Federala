if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'https://example.invalid';
}
if (!process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
}

export {};
