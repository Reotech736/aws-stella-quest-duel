import { RouterProvider } from "react-router-dom";

import { AudioProvider } from "../audio/AudioContext";
import { AuthProvider } from "../auth/AuthContext";
import { router } from "../routes/router";

export function App() {
  return (
    <AudioProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AudioProvider>
  );
}
