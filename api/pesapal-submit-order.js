export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const isLive = process.env.PESAPAL_ENV === 'live'
    const baseUrl = isLive 
        ? 'https://pay.pesapal.com/v3' 
        : 'https://cybqa.pesapal.com/pesapalv3'

    const { amount, description, email, phone, firstName, lastName } = req.body

    if (!amount || !email) {
        return res.status(400).json({ error: 'Amount and email are required' })
    }

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

        // Step 2 - submit order request
        const orderId = `audit-${Date.now()}`

        const orderResponse = await fetch(`${baseUrl}/api/Transactions/SubmitOrderRequest`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authData.token}`
            },
            body: JSON.stringify({
                id: orderId,
                currency: 'UGX',
                amount: amount,
                description: description || 'AuditLog Service Payment',
                callback_url: `https://${req.headers.host}/payment-success.html`,
                notification_id: process.env.PESAPAL_IPN_ID,
                billing_address: {
                    email_address: email,
                    phone_number: phone || '',
                    first_name: firstName || '',
                    last_name: lastName || ''
                }
            })
        })

        const orderData = await orderResponse.json()

        return res.status(200).json(orderData)

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}