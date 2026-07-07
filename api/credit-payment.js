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
        // Step 1 - re-verify with Pesapal directly, never trust the browser
        const authResponse = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumer_key: process.env.PESAPAL_CONSUMER_KEY,
                consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
            })
        })
        const authData = await authResponse.json()

        const statusResponse = await fetch(
            `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
            {
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${authData.token}` }
            }
        )
        const statusData = await statusResponse.json()

        if (statusData.status_code !== 1) {
            return res.status(400).json({ error: 'Payment not completed', status: statusData.status_code })
        }

        // Step 2 - extract userId from merchant_reference, never from the browser's claim
        const parts = statusData.merchant_reference.split('_')
        const userId = parts[1]

        if (!userId) {
            return res.status(400).json({ error: 'Could not parse userId from reference' })
        }

        // Step 3 - use service_role key, bypasses RLS entirely, server-side only
        const supabaseAdminUrl = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`

        const getCurrentResponse = await fetch(supabaseAdminUrl, {
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        })
        const currentData = await getCurrentResponse.json()
        const currentCredits = currentData[0]?.paid_credits || 0

        const updateResponse = await fetch(supabaseAdminUrl, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ paid_credits: currentCredits + 1 })
        })

        const updated = await updateResponse.json()

        return res.status(200).json({ success: true, paid_credits: updated[0]?.paid_credits })

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}