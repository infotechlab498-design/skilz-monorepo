
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './home/Home';
import About from './about/About';
import Contact from './contact/Contact';
import Leaderboard from './leaderboard/Leaderboard';
import Guide from './guide/Guide';
import BlogPageContainer from './blog/SingleBlogPage';

import SignIn from './Components/authPages/SignIn';
import SignUp from './Components/authPages/SignUp';
import ForgetPass from './Components/authPages/ForgetPass';
import TriviaLobby from './lobbyPages/TriviaLobby';
import CheckoutPage from './payment/CheckoutPage';
import AdminPaymentsDashboard from './payment/AdminPaymentsDashboard';

import SignUpOtp from './Components/authPages/SignUpOtp';
import SetNewPassword from './Components/authPages/SetNewPassword';
import Profile from './Components/Profile';
import Settings from './Components/Settings';
import SearchPage from './Components/SearchPage';
import LudoGameLobby from './games/LudoLobby';
import LudoGameRoom from './games/LudoGameRoom.jsx';
import MathRushGameLobby from './games/MathRushLobby';
import MathRushGameRoom from './games/mathRush/MathRushGameRoom.jsx';
import TriviaGameRoom from './games/TriviaGameRoom.jsx';
import LobbySliders from './lobbyPages/components/LobbySliders';
import UserSync from './Components/UserSync';
import ProtectedGameRoute from './Components/ProtectedGameRoute.jsx';
import FirebaseAuthSync from './Components/FirebaseAuthSync.jsx';
import AuthNoticeBanner from './Components/AuthNoticeBanner.jsx';
import LudoInviteListener from './games/ludoGame/components/LudoInviteListener.jsx';
import PlayerDashboardLayout from './layout/PlayerDashboardLayout.jsx';
import PlayerDashboardHomePage from './pages/player/playerDashboardHome.jsx';
import PlayerFriendListPage from './pages/player/playerFriendList.jsx';
import PlayerBillingPage from './pages/player/playerBilling.jsx';
import PlayerProfilePage from './pages/player/playerProfile.jsx';
import PlChangePasswordPage from './pages/player/plChangePassword.jsx';
import PlSettingsPage from './pages/player/plSettings.jsx';
import EnigmaPulseLobby from './games/EnigmaPulse/EnigmaPulseLobby.jsx';
import EnigmaPulseGameRoom from './games/EnigmaPulse/EnigmaPulseGameRoom.jsx';
import Syllogism from './games/EnigmaPulse/Syllogism.jsx';
import SyllogismJoining from './games/EnigmaPulse/SyllogismJoining.jsx';
import PatternRecognition from './games/EnigmaPulse/PatternRecognition.jsx';
import PatternRecognitionJoining from './games/EnigmaPulse/PatternRecognitionJoining.jsx';
import WordCipher from './games/EnigmaPulse/WordCipher.jsx';
import NeuroChainLobby from './games/neurochain/NeuroChainLobby.jsx';
import NeuroChainGame from './games/neurochain/NeuroChainGame.jsx';
import CognitiveGameRoom from './games/cognitive/CognitiveGameRoom.jsx';


function App() {

  return (
    <>
      <Router>
        <AuthNoticeBanner />
        <FirebaseAuthSync />
        <LudoInviteListener />
        <Routes>

          <Route path="/" element={<Home />} />
          <Route path='/blogs' element={<BlogPageContainer />} />
          <Route path='/blogs/:slug' element={<BlogPageContainer />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path='/signup' element={<SignUp />} />
          <Route path='/signin' element={<SignIn />} />
          <Route path='/signup-otp' element={<SignUpOtp />} />
          <Route path='/forget-password' element={<ForgetPass />} />
          <Route path='/set-new-password' element={<SetNewPassword />} />

          <Route path='/profile' element={<Profile />} />
          <Route path='/settings' element={<Settings />} />
          <Route path='/search' element={<SearchPage />} />
          <Route
            path='/enigmaPulseLobby'
            element={<ProtectedGameRoute><EnigmaPulseLobby /></ProtectedGameRoute>}
          />
          <Route
            path='/enigmaPulse/game/:roomId'
            element={<ProtectedGameRoute><EnigmaPulseGameRoom /></ProtectedGameRoute>}
          />
          <Route
            path='/enigmaPulse/sequence/joining'
            element={<ProtectedGameRoute><PatternRecognitionJoining /></ProtectedGameRoute>}
          />
          <Route
            path='/enigmaPulse/sequence/:roomId'
            element={<ProtectedGameRoute><PatternRecognition /></ProtectedGameRoute>}
          />

          <Route
            path='/enigmaPulse/cipher/:roomId'
            element={<ProtectedGameRoute><WordCipher /></ProtectedGameRoute>}
          />

          <Route
            path='/enigmaPulse/syllogism/joining'
            element={<ProtectedGameRoute><SyllogismJoining /></ProtectedGameRoute>}
          />

          <Route
            path='/enigmaPulse/syllogism'
            element={<ProtectedGameRoute><Syllogism /></ProtectedGameRoute>}
          />

          <Route
            path='/neurochainLobby'
            element={<ProtectedGameRoute><NeuroChainLobby /></ProtectedGameRoute>}
          />

          <Route
            path='/neurochain/game/:gameId'
            element={<ProtectedGameRoute><NeuroChainGame /></ProtectedGameRoute>}
          />

          <Route
            path='/cognitive/game/:roomId'
            element={<ProtectedGameRoute><CognitiveGameRoom /></ProtectedGameRoute>}
          />

          <Route
            path='/triviaLobby/:gameId'
            element={<ProtectedGameRoute><TriviaLobby /></ProtectedGameRoute>}
          />
          <Route
            path='/trivia/game/:roomId'
            element={<ProtectedGameRoute><TriviaGameRoom /></ProtectedGameRoute>}
          />
          <Route
            path='/ludoLobby'
            element={<ProtectedGameRoute><LudoGameLobby />
            </ProtectedGameRoute>}
          />
          <Route
            path='/mathRushLobby'
            element={<ProtectedGameRoute><MathRushGameLobby /></ProtectedGameRoute>}
          />

          <Route
            path='/mathRush/game/:roomId'
            element={<ProtectedGameRoute><MathRushGameRoom /></ProtectedGameRoute>}
          />

          <Route path='/lobbySliders' element={<LobbySliders />} />
          <Route path='/checkout' element={<CheckoutPage />} />
          <Route path='/admin/payments' element={<AdminPaymentsDashboard />} />
          <Route path='/ludo/:gameId' element={<Navigate to="/ludoLobby" replace />} />

          <Route
            path='/ludo/game/:roomId'
            element={<ProtectedGameRoute><LudoGameRoom /></ProtectedGameRoute>}
          />
          <Route path='/playerFriendList' element={<Navigate to="/player/friends" replace />} />

          {/* Player dashboard (persistent sidebar layout) */}

          <Route path="/player" element={<PlayerDashboardLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<PlayerDashboardHomePage />} />
            <Route path="friends" element={<PlayerFriendListPage />} />
            <Route path="billing" element={<PlayerBillingPage />} />
            <Route path="profile" element={<PlayerProfilePage />} />
            <Route path="change-password" element={<PlChangePasswordPage />} />
            <Route path="settings" element={<PlSettingsPage />} />
          </Route>

        </Routes>
        <UserSync />
      </Router>

    </>
  )
}

export default App;
