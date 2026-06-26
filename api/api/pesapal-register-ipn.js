export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const isLive = process.env.PESAPAL_ENV === 'live'
    const baseUrl = isLive 
        ? 'https://pay.pesapal.com/v3' 
        : 'https://cybqa.pesapal.com/pesapalv3'

    try {
        // Step 1 - get auth token
        const authResponse = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
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

        const authData = await authResponse.json()

        if (!authData.token) {
            return res.status(400).json({ error: 'Failed to authenticate', details: authData })
        }

        // Step 2 - register IPN url using that token
        const ipnResponse = await fetch(`${baseUrl}/api/URLSetup/RegisterIPN`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authData.token}`
            },
            body: JSON.stringify({
                url: `https://${req.headers.host}/api/pesapal-ipn`,
                ipn_notification_type: 'GET'
            })
        })

        const ipnData = await ipnResponse.json()

        return res.status(200).json(ipnData)

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}