import { createBrowserRouter, Navigate } from "react-router-dom";

import { GamePage } from "./GamePage";
import { HomePage } from "./HomePage";
import { LoginPage } from "./LoginPage";
import { WaitingRoomPage } from "./WaitingRoomPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/rooms/:roomId",
    element: <WaitingRoomPage />,
  },
  {
    path: "/games/:gameId",
    element: <GamePage />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
