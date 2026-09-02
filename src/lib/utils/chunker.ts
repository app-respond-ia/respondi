export function chunkTextRecursive(
  text: string,
  chunkSize: number = 1200,
  chunkOverlap: number = 200
): string[] {
  if (!text || text.trim() === '') return []
  
  const separators = ['\n\n', '\n', '. ', ' ']
  
  function splitText(textToSplit: string, currentSepIndex: number): string[] {
    const finalChunks: string[] = []
    
    const separator = separators[currentSepIndex] || ''
    const splits = separator === '' ? [textToSplit] : textToSplit.split(separator)
    let goodSplits: string[] = []
    
    for (const split of splits) {
      if (split.length > chunkSize) {
        if (goodSplits.length > 0) {
          finalChunks.push(...mergeSplits(goodSplits, separator))
          goodSplits = []
        }
        if (currentSepIndex < separators.length - 1) {
          finalChunks.push(...splitText(split, currentSepIndex + 1))
        } else {
          // No hay más separadores, cortar rudo
          for (let i = 0; i < split.length; i += chunkSize) {
            finalChunks.push(split.substring(i, i + chunkSize))
          }
        }
      } else {
        goodSplits.push(split)
      }
    }
    
    if (goodSplits.length > 0) {
      finalChunks.push(...mergeSplits(goodSplits, separator))
    }
    
    return finalChunks
  }
  
  function mergeSplits(splits: string[], separator: string): string[] {
    const chunks: string[] = []
    let currentDoc: string[] = []
    let currentLength = 0
    
    for (const split of splits) {
      const splitLength = split.length
      if (currentLength + splitLength + (currentDoc.length > 0 ? separator.length : 0) > chunkSize) {
        if (currentDoc.length > 0) {
          chunks.push(currentDoc.join(separator))
          while (currentDoc.length > 0 && (currentLength > chunkOverlap || currentLength + splitLength > chunkSize)) {
            currentLength -= currentDoc[0].length + (currentDoc.length > 1 ? separator.length : 0)
            currentDoc.shift()
          }
        }
      }
      currentDoc.push(split)
      currentLength += splitLength + (currentDoc.length > 1 ? separator.length : 0)
    }
    if (currentDoc.length > 0) {
      chunks.push(currentDoc.join(separator))
    }
    return chunks
  }
  
  return splitText(text.trim(), 0)
}
