import { Amplify } from "aws-amplify";

export function configureAmplify(): void {
  const region = import.meta.env.VITE_AWS_REGION;
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId =
    import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;

  if (region && userPoolId && userPoolClientId) {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
        },
      },
    });
  }
}
