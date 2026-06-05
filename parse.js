async function parseDocument(file) {
    // This will be replaced with real Claude API call later
    // For now we return mock extracted data to keep building

    const mockResponse = {
        invoices: [
    {
        "DATE": "2023-01-15",
        "PARTICULARS": "6X20FT STC OF IMPORTS",
        "INV.NO.": "WH-1001",
        "AMOUNT": 5700,
        "PAYMENTS": 0
    },
    {
        "DATE": "2023-02-20",
        "PARTICULARS": "3X20FT STC OF COFFEE TO MOMBASA PORT",
        "INV.NO.": "WH-1002",
        "AMOUNT": 2850,
        "PAYMENTS": 0
    },
    {
        "DATE": "44862",
        "PARTICULARS": "5X20FT STC OF IMPORTS",
        "INV.NO.": "WH-1003",
        "AMOUNT": 5000,
        "PAYMENTS": 0
    },
    {
        "DATE": "2023-04-01",
        "PARTICULARS": "Payment received",
        "INV.NO.": "WH-3013",
        "AMOUNT": 0,
        "PAYMENTS": 2000
    }
],
        supplier: "White Horse Carriers Ltd",
        client: "NAK Shipping & Logistics Ltd",
        statement_period: "2023"
    }

    return mockResponse
}