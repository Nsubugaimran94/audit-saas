export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { orderTrackingId } = req.body
    if (!orderTrackingId) {
        return res.status(400).json({ error: 'orderTrackingId required' })
    }

    const isLive = process.env.PESAPAL_ENV === 'live'
    const baseUrl = isLive
        ? 'https://pay.pesapal.com/v3'
        : 'https://cybqa.pesapal.com/pesapalv3'

    try {
        // Auth
        const authResponse = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumer_key: process.env.PESAPAL_CONSUMER_KEY,
                consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
            })
        })
        const authData = await authResponse.json()

        // Check real transaction status
        const statusResponse = await fetch(
            `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authData.token}`
                }
            }
        )
        const statusData = await statusResponse.json()

        // Pesapal status_code: 1 = COMPLETED, 2 = FAILED, 0 = INVALID, 3 = REVERSED
        let status = 'PENDING'
        if (statusData.status_code === 1) status = 'COMPLETED'
        if (statusData.status_code === 2) status = 'FAILED'
        if (statusData.status_code === 3) status = 'FAILED'

        return res.status(200).json({
            status,
            merchant_reference: statusData.merchant_reference,
            amount: statusData.amount,
            raw: statusData
        })

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}