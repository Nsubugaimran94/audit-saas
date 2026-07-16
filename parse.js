async function parseDocument(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result)
                const workbook = XLSX.read(data, { type: 'array' })

                // Get first sheet
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]]

                // Convert to JSON
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

                console.log('Raw extracted rows:', rows)

                // Try to detect client and supplier from first few rows
                let client = 'Unknown Client'
                let supplier = 'Unknown Supplier'

                // Look for client/supplier info in raw sheet data
                const rawRows = XLSX.utils.sheet_to_json(firstSheet, { 
                    header: 1, 
                    defval: '' 
                })

                rawRows.slice(0, 10).forEach(row => {
                    const rowText = row.join(' ').toUpperCase()
                    if (rowText.includes('NAK')) client = 'NAK Shipping & Logistics Ltd'
                    if (rowText.includes('WHITE HORSE')) supplier = 'White Horse Carriers Ltd'
                })

                resolve({
                    invoices: rows,
                    client: client,
                    supplier: supplier,
                    statement_period: new Date().getFullYear().toString(),
                    raw_rows: rawRows
                })

            } catch(err) {
                reject(err)
            }
        }

        reader.onerror = reject
        reader.readAsArrayBuffer(file)
    })
}

async function inspectPdfStructure(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    const page = await pdf.getPage(1)
    const textContent = await page.getTextContent()

    const items = textContent.items.map(item => ({
        text: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5])
    }))

    console.log('RAW PDF TEXT ITEMS (page 1):', items)
    const nakRows = extractNakTable(items)

    items.slice(40, 90).forEach((item, i) => {
        console.log(`Item ${i + 40}:`, item.text, '| x:', item.x, '| y:', item.y)
    })

    return items
}

function extractNakTable(items) {
    const rowsByY = {}
    items.forEach(item => {
        const yKey = item.y
        if (!rowsByY[yKey]) rowsByY[yKey] = []
        rowsByY[yKey].push(item)
    })

    const columnRanges = {
        DATE: [40, 95],
        PARTICULARS: [95, 350],
        'INV.NO.': [350, 400],
        AMOUNT: [400, 462],
        PAYMENTS: [462, 540]
    }

    function assignColumn(x) {
        for (const [col, [min, max]] of Object.entries(columnRanges)) {
            if (x >= min && x < max) return col
        }
        return null
    }

    const structuredRows = []

    Object.keys(rowsByY)
        .sort((a, b) => b - a)
        .forEach(yKey => {
            const rowItems = rowsByY[yKey].sort((a, b) => a.x - b.x)
            const row = { DATE: '', PARTICULARS: '', 'INV.NO.': '', AMOUNT: '', PAYMENTS: '' }

            rowItems.forEach(item => {
                const col = assignColumn(item.x)
                if (col && item.text.trim()) {
                    row[col] = (row[col] + ' ' + item.text).trim()
                }
            })

            if (/^\d{2}\/\d{2}\/\d{4}$/.test(row.DATE.trim())) {
                structuredRows.push(row)
            }
        })

    console.log('STRUCTURED NAK ROWS:', structuredRows.slice(0, 10))
    return structuredRows
}