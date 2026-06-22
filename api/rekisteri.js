import dotenv from 'dotenv';
dotenv.config();

import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      // Laajennetaan oikeuksia koskemaan myös Drive-latausta
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
    });

    const client = await auth.getClient();
    
    // Haetaan päärekisteri suoraan Googlen export-rajapinnasta botin tunnuksilla
    const rekisteriId = "1P1Zd-oPY_d3kmvdllG5rBdG6_ISjkW-ZkQVvSierEGA";
    const url = `https://docs.google.com/spreadsheets/d/${rekisteriId}/export?format=csv`;

    const googleRes = await client.request({
      url: url,
      responseType: 'text'
    });

    const csvText = googleRes.data;

    res.setHeader('Content-Type', 'text/csv');
    return res.status(200).send(csvText);

  } catch (error) {
    return res.status(500).json({ 
      error: "Google-lataus epäonnistui", 
      message: error.message 
    });
  }
}