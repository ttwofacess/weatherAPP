// functions/api/config.js

export async function onRequestGet(context) {
    const apiKey = context.env.OPENWEATHERMAP_API_KEY;

    if (!apiKey) {
        console.error('OPENWEATHERMAP_API_KEY environment variable not set in Cloudflare Pages.');
        return new Response(JSON.stringify({ error: 'Application configuration error.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ apiKey }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
