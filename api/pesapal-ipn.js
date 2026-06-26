export default async function handler(req, res) {
    console.log('IPN received:', req.query)

    // For now just acknowledge receipt
    // Later this is where we update Supabase with payment status

    return res.status(200).json({
        orderNotificationType: 'IPNCHANGE',
        orderTrackingId: req.query.OrderTrackingId,
        orderMerchantReference: req.query.OrderMerchantReference,
        status: 200
    })
}