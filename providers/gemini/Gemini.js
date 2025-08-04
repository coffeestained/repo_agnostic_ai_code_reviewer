import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../../lib/logger.js';
import { prompts } from '../../constants/prompts.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const allowedGeminiActionsMap = {
    'initial': 'REVIEW_INSTRUCTIONS',
    'update': 'UPDATE_INSTRUCTIONS'
};

export async function doGeminiResponse(diff, description, actionType, commentTree, agentName = 'UNK', asJson = true) {
    if (!allowedGeminiActionsMap.hasOwnProperty(actionType)) throw "Bad action type";
    const prompt = {
        agentName,
        globalInstructions: prompts.BASE_INSTRUCTIONS,
        actionInstructions: prompts[allowedGeminiActionsMap[actionType]],
        diff,
        description,
        commentTree
    }

    Logger.info(`Provider processing gemini request starting. ${process.env.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const result = await model.generateContent(JSON.stringify(prompt));
    const response = result.response.text();
    Logger.info(`Provider processing gemini request gathered.`);
    let formatted = response;
    try {
        if (asJson) formatted = JSON.parse(response);
    } catch (e) {
        Logger.error(`Provider processing gemini format issue. ${response}`);
        Logger.error(`Provider processing gemini format issue. ${e}`);
        throw new Error('Provider experienced parsing issue with message from LLM.');
    }
    Logger.info(`Provider processing gemini returning.`);
    return formatted;
}

