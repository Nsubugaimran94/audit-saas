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

 items.slice(40, 90).forEach((item, i) => {
    console.log(`Item ${i + 40}:`, item.text, '| x:', item.x, '| y:', item.y)
})
    return items
}