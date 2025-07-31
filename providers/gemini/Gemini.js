import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const allowedGeminiActionsMap = {
    'initial': 'REVIEW_INSTRUCTIONS',
    'comment': 'COMMENT_INSTRUCTIONS'
};

export async function doGeminiResponse(diff, description, actionType, commentTree, asJson = true) {
    if (!allowedGeminiActionsMap.hasOwnProperty(actionType)) throw "Bad action type";
    const prompt = `
        Global Instructions: 
        ${process.env.BASE_INSTRUCTIONS} 

        Action Instructions: 
        ${process.env[allowedGeminiActionsMap[actionType]]} 

        Start Diff --
        ${JSON.stringify(diff, null, 2)}
        End Diff -- 

        Description: 
        ${description}

        Current Comment Tree: 
        ${JSON.stringify(commentTree, null, 2)}
    `;
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return asJson ? JSON.parse(response) : response;
}

