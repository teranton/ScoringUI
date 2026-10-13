// Palvelutilin Google-asiakas, yksi per funktioinstanssi.
import { GoogleAuth } from 'google-auth-library';

let asiakasLupaus = null;

export function haeGoogleAsiakas() {
  if (!asiakasLupaus) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: String(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
    });
    asiakasLupaus = auth.getClient().catch((error) => {
      asiakasLupaus = null;
      throw error;
    });
  }
  return asiakasLupaus;
}
