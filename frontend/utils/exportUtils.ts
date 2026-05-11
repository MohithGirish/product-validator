
export const downloadDataAsCSV = (data: any[], filename: string, excludedKeys: string[] = []) => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }
  
    // 1. Determine all unique keys (columns) from the data, filtering out excluded ones
    const allKeys = Array.from(new Set(data.flatMap(item => Object.keys(item))));
    const validKeys = allKeys.filter(key => !excludedKeys.includes(key));
  
    // 2. Create Header Row
    // We capitalize headers for better readability in Excel
    const headerRow = validKeys.map(key => `"${key.charAt(0).toUpperCase() + key.slice(1)}"`).join(',');
  
    // 3. Create Data Rows
    const dataRows = data.map(row => {
      return validKeys.map(key => {
        const val = row[key];
        
        // Handle null/undefined
        if (val === null || val === undefined) {
            return '';
        }
  
        const strVal = String(val);

        // FIX: Prevent Excel from converting long numbers (like Barcodes) to scientific notation (e.g., 8.9E+12).
        // By prepending a tab character '\t' and wrapping in quotes, Excel treats the cell as text.
        // We apply this to keys containing 'barcode' or strictly numeric strings longer than 11 digits.
        if (key.toLowerCase().includes('barcode') || (/^\d+$/.test(strVal) && strVal.length > 11)) {
            return `"\t${strVal}"`;
        }
  
        // Handle values that need escaping (strings with commas, quotes, or newlines)
        if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) {
          return `"${strVal.replace(/"/g, '""')}"`; // Double up quotes to escape them in CSV
        }
        
        return strVal;
      }).join(',');
    });
  
    // 4. Combine and Download
    const csvContent = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create a temporary link to trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
