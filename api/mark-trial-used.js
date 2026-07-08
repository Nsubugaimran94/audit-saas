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

        const updateResponse = await fetch(profileUrl, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ free_trial_used: true })
        })

        const updated = await updateResponse.json()
        return res.status(200).json({ success: true, free_trial_used: updated[0]?.free_trial_used })

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}