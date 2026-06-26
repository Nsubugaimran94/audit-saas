export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const isLive = process.env.PESAPAL_ENV === 'live'
    const baseUrl = isLive 
        ? 'https://pay.pesapal.com/v3' 
        : 'https://cybqa.pesapal.com/pesapalv3'

    try {
        const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                consumer_key: process.env.PESAPAL_CONSUMER_KEY,
                consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
            })
        })

        const data = await response.json()

        if (data.token) {
            return res.status(200).json({ token: data.token })
        } else {
            return res.status(400).json({ error: 'Failed to get token', details: data })
        }
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}