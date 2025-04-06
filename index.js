const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

// Créer l'application Express directement au lieu d'un router
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Fonction pour traduire un texte via MyMemory
async function translateText(text) {
    // Si le texte est vide, retourner une chaîne vide
    if (!text) return '';
    
    // Vérifier si le texte doit être divisé (limite MyMemory: 500 caractères)
    const MAX_LENGTH = 500;
    if (text.length <= MAX_LENGTH) {
        // Si le texte est assez court, traduire directement
        return await translateChunk(text);
    } else {
        // Sinon, diviser le texte en morceaux et traduire chacun
        let result = '';
        let startIndex = 0;
        
        while (startIndex < text.length) {
            // Trouver un bon point de coupure (idéalement à la fin d'une phrase)
            let endIndex = startIndex + MAX_LENGTH;
            if (endIndex >= text.length) {
                endIndex = text.length;
            } else {
                // Chercher le dernier point ou retour à la ligne avant la limite
                const lastPeriod = text.lastIndexOf('.', endIndex);
                const lastNewline = text.lastIndexOf('\n', endIndex);
                
                if (lastPeriod > startIndex && lastPeriod > lastNewline) {
                    endIndex = lastPeriod + 1; // Inclure le point
                } else if (lastNewline > startIndex) {
                    endIndex = lastNewline + 1; // Inclure le retour à la ligne
                }
            }
            
            // Extraire le morceau de texte à traduire
            const chunk = text.substring(startIndex, endIndex);
            
            // Traduire le morceau
            const translatedChunk = await translateChunk(chunk);
            
            // Ajouter au résultat
            result += translatedChunk;
            
            // Avancer au prochain morceau
            startIndex = endIndex;
        }
        
        return result;
    }
}

// Fonction pour traduire un morceau de texte
async function translateChunk(text) {
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|fr`;
        const response = await axios.get(url);
        
        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
            return response.data.responseData.translatedText;
        } else {
            console.error('Erreur de traduction, format de réponse inattendu:', response.data);
            return text; // Retourner le texte original en cas d'erreur
        }
    } catch (error) {
        console.error('Erreur lors de la traduction:', error.message);
        return text; // Retourner le texte original en cas d'erreur
    }
}

async function fetchTriviaQuestion() {
    const url = 'https://opentdb.com/api.php?amount=1&type=multiple';

    try {
        const response = await axios.get(url);
        
        // Vérifie si la réponse est valide
        if (response.data.response_code !== 0) {
            throw new Error('Erreur lors de la récupération des questions');
        }

        const questionData = response.data.results[0];
        const question = questionData.question;
        const correctAnswer = questionData.correct_answer;
        const incorrectAnswers = questionData.incorrect_answers;

        // Mélange des réponses pour que la réponse correcte ne soit pas toujours en premier
        const allAnswers = [...incorrectAnswers, correctAnswer];
        const shuffledAnswers = allAnswers.sort(() => Math.random() - 0.5); // Mélange aléatoire

        // Format des données de la question en anglais
        let englishTriviaData = {
            question: question,
            possibleAnswers: shuffledAnswers,
            correctAnswer: correctAnswer
        };

        // Format pour l'affichage (texte formaté en anglais)
        let englishFormattedData = `Question: ${question}\n\nPossible answers:\n`;
        shuffledAnswers.forEach((answer, index) => {
            englishFormattedData += `\n${index + 1}. ${answer}`;
        });
        englishFormattedData += `\n\nCorrect answer: ${correctAnswer}`;

        // Traduire les éléments en français
        const translatedQuestion = await translateText(question);
        const translatedCorrectAnswer = await translateText(correctAnswer);
        const translatedIncorrectAnswers = await Promise.all(
            incorrectAnswers.map(answer => translateText(answer))
        );

        // Mélanger les réponses traduites de la même manière
        const translatedAllAnswers = [...translatedIncorrectAnswers, translatedCorrectAnswer];
        const translatedShuffledAnswers = [];
        
        // Garder le même ordre que les réponses anglaises
        shuffledAnswers.forEach((answer, index) => {
            if (answer === correctAnswer) {
                translatedShuffledAnswers[index] = translatedCorrectAnswer;
            } else {
                const originalIndex = incorrectAnswers.indexOf(answer);
                translatedShuffledAnswers[index] = translatedIncorrectAnswers[originalIndex];
            }
        });

        // Format des données de la question en français
        let frenchTriviaData = {
            question: translatedQuestion,
            possibleAnswers: translatedShuffledAnswers,
            correctAnswer: translatedCorrectAnswer
        };

        // Format pour l'affichage (texte formaté en français)
        let frenchFormattedData = `🎉 Question : ${translatedQuestion}\n\n❓ Réponses possibles :\n`;
        translatedShuffledAnswers.forEach((answer, index) => {
            frenchFormattedData += `\n${index + 1}. ${answer}`;
        });
        frenchFormattedData += `\n\n🔑 Réponse correcte : ${translatedCorrectAnswer}`;

        // Retourner les deux versions
        return {
            english: englishTriviaData,
            french: frenchTriviaData,
            englishFormatted: englishFormattedData,
            frenchFormatted: frenchFormattedData
        };
    } catch (error) {
        if (error.response) {
            return { error: `Erreur lors de la récupération des données : ${error.response.status}` };
        } else {
            return { error: `Une erreur inattendue s'est produite : ${error.message}` };
        }
    }
}

// Route principale
app.get('/api/trivia', async (req, res) => {
    try {
        const triviaData = await fetchTriviaQuestion();
        res.json({ 
            quiz: {
                english: triviaData.english,
                french: triviaData.french
            },
            formatted: {
                english: triviaData.englishFormatted,
                french: triviaData.frenchFormatted
            }
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de la question:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// Route racine pour vérifier que l'API fonctionne
app.get('/', (req, res) => {
    res.json({ message: 'API de quiz trivia en anglais et français. Utilisez /api/trivia pour obtenir une question.' });
});

// Route 404 pour les chemins non trouvés
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Définir le port depuis les variables d'environnement ou utiliser 3000 par défaut
const PORT = process.env.PORT || 3000;

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
