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
        diff,
        commentTree,
        description,
        agentName,
        globalInstructions: prompts.BASE_INSTRUCTIONS,
        actionInstructions: prompts[allowedGeminiActionsMap[actionType]],
    }
    Logger.info(`Provider processing gemini request starting. ${process.env.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL });
    const result = await model.generateContent(JSON.stringify(prompt));
    const response = result.response.text();
    Logger.info(`Provider processing gemini request prompt generated. \n \n ${JSON.stringify(prompt, null, 2)}`);
    let formatted = response;
    try {
        if (asJson) {
            const implicitReplaceMarkDown = (
                formatted.startsWith('```') ? response.match(/```json\s*\n([\s\S]*?)\n```/)?.[1] : response
            ) ?? response;
            formatted = JSON.parse(implicitReplaceMarkDown);
        }
    } catch (e) {
        Logger.error(`Provider processing gemini format issue. ${response}`);
        Logger.error(`Provider processing gemini format issue. ${e}`);
        throw new Error('Provider experienced parsing issue with message from LLM.');
    }
    Logger.info(`Provider processing gemini returning.`);
    return formatted;
}

