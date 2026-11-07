type FormatTextType = 'uppercase' | 'lowercase' | 'capitalize'

/**
 * Format texts based on the type provided
 *
 * @param {string} text - text to be formatted
 * @param {FormatTextType} type - The type of formatting to apply
 *                        Accepted values are:
 *                        - 'capitalize': Capitalizes the first letter and converts the rest to lowercase.
 *                        - 'uppercase': Converts the entire text to uppercase.
 *                        - 'lowercase': Converts the entire text to lowercase.
 *                        - Any other value will return the text unchanged.
 * @returns {string} - The formatted text
 */
export const formatText = (text: string, type: FormatTextType): string => {
    const exemptedWords = ['to']
   switch (type) {
        case 'uppercase':
            return text.toUpperCase()
        case 'lowercase':
            return text.toLowerCase()
        case 'capitalize':
            return text.toLowerCase().split(" ").map(_word => !exemptedWords.includes(_word) ? _word.charAt(0).toUpperCase() + _word.slice(1) : _word).join(" ")
        default:
            return text
   }
}