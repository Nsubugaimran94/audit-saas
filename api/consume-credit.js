export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { userId } = req.body
    if (!userId) {
        return res.status(400).json({ error: 'userId required' })
    }

    try {
        const profileUrl = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`

        const getCurrentResponse = await fetch(profileUrl, {
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        })
        const currentData = await getCurrentResponse.json()
        const currentCredits = currentData[0]?.paid_credits || 0

        if (currentCredits <= 0) {
            return res.status(400).json({ error: 'No credits available' })
        }

        const updateResponse = await fetch(profileUrl, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ paid_credits: currentCredits - 1 })
        })

        const updated = await updateResponse.json()

        if (!updateResponse.ok || !Array.isArray(updated) || updated.length === 0) {
            return res.status(500).json({
                error: 'Credit update did not affect any rows — write may have silently failed',
                details: updated
            })
        }

        return res.status(200).json({ success: true, paid_credits: updated[0].paid_credits })

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}