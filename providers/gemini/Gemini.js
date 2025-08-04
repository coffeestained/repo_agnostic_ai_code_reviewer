import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const allowedGeminiActionsMap = {
    'initial': 'REVIEW_INSTRUCTIONS',
    'update': 'UPDATE_INSTRUCTIONS'
};

export async function doGeminiResponse(diff, description, actionType, commentTree, agentName = 'UNK', asJson = true) {
    if (!allowedGeminiActionsMap.hasOwnProperty(actionType)) throw "Bad action type";
    const prompt = {
        agentName,
        globalInstructions: process.env.BASE_INSTRUCTIONS,
        actionInstructions: process.env[allowedGeminiActionsMap[actionType]],
        diff,
        description,
        commentTree
    }
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const result = await model.generateContent(JSON.stringify(prompt));
    const response = result.response.text();

    let formatted = response;
    try {
        if (asJson) formatted = JSON.parse(response);
    } catch {
        throw new Error('Provider experienced parsing issue with message from LLM.');
    }
    return formatted;
}

