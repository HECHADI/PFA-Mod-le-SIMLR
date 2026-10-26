import axios from 'axios';

const API_URL = 'http://localhost:8000';

export const getEpidemicData = async (country, beta = 0.3, gamma = 0.05) => {
    try {
        const response = await axios.get(`${API_URL}/api/epidemic/${country}`, {
            params: { beta, gamma }
        });
        return response.data;
    } catch (error) {
        console.error("Erreur lors de la récupération des données", error);
        throw error;
    }
};
