import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const allowedGeminiActionsMap = {
    'review': 'REVIEW_INSTRUCTIONS',
    'comment': 'COMMENT_INSTRUCTIONS'
};

export async function doGeminiResponse(diff, description, actionType = 'review') {
    if (!allowedGeminiActionsMap.hasOwnProperty(actionType)) throw "Bad action type";
    const prompt = ```
        Global Instructions: 
        ${process.env.BASE_INSTRUCTIONS} 

        Action Instructions: 
        ${process.env[allowedGeminiActionsMap[actionType]]} 

        Diff: 
        ${diff}

        Description: 
        ${description}
    ```;
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return _formatResponse(text);
}

function _formatResponse(text) {
    // Convert LLM response to array of comment objects
    return [];
}