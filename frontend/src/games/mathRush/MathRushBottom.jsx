import React, { useContext } from 'react'
import { GameContext } from './contexts';
import './styles/lobby.css';
import { Volume2 } from 'lucide-react';
import { Play } from 'lucide-react';

export default function BottomBar() {
    const gameContext = useContext(GameContext);
    if (!gameContext) return null;
    const { difficulty, setDifficulty, startMatch, isSearching } = gameContext;

    return (

        <footer className="game-footer-1">

            {/* LEFT - DIFFICULTY */}

            <div className="footer-left-1">
                <span className="footer-label-1">Difficulty</span>

                <div className="difficulty-group-1">
                    {['easy', 'medium', 'hard'].map((d) => (
                        <button
                            key={d}
                            onClick={() => setDifficulty(d)}
                            className={`difficulty-btn-1 ${difficulty === d ? "active" : ""}`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            {/* CENTER */}

            <div className="footer-center-1">

                <button
                    onClick={startMatch}
                    disabled={isSearching}
                    className="start-btn-1"
                >
                    <div className={`start-icon-1 ${isSearching ? "spin-1" : ""}`}>
                        <Play className="play-icon-1" />
                    </div>

                    <span className="start-text-1">
                        {isSearching ? "Searching..." : "START RUSH"}
                    </span>
                </button>

            </div>

            {/* RIGHT */}

            <div className="footer-right-1">

                <div className="audio-status-1">
                    <span className="footer-label-1">Audio Engine</span>
                    <div className="audio-active-1">
                        <span className="active-text-1">Active</span>
                        <div className="active-dot-1"></div>
                    </div>
                </div>

                <button className="icon-btn-1 large">
                    <Volume2 />
                </button>

            </div>

        </footer>





    );
};







// <footer className="h-24 md:h-32 bg-[#0F0C1D] border-t border-white/5 flex items-center justify-between px-8 md:px-12 z-50">
//   <div className="flex flex-col gap-2">
//     <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Difficulty</span>
//     <div className="flex bg-[#1A162D] rounded-2xl p-1.5 border border-white/5 shadow-inner">
//       {['easy', 'medium', 'hard'].map((d) => (
//         <button
//           key={d}
//           onClick={() => setDifficulty(d)}
//           className={cn(
//             "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
//             difficulty === d
//               ? "bg-google-blue text-white shadow-lg shadow-google-blue/20"
//               : "text-white/20 hover:text-white/40"
//           )}
//         >
//           {d}
//         </button>
//       ))}
//     </div>
//   </div>

//   <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center gap-6">
//     <button
//       onClick={startMatch}
//       disabled={isSearching}
//       className="btn-google h-20 md:h-24 px-12 md:px-16 rounded-[32px] text-xl md:text-2xl flex items-center gap-6 shadow-[0_20px_50px_rgba(112,0,255,0.4)] group active:scale-95 transition-all"
//     >
//       <div className={cn("w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", isSearching && "animate-spin")}>
//         <Play className="w-5 h-5 md:w-6 md:h-6 fill-white" />
//       </div>
//       <span className="tracking-tighter uppercase">{isSearching ? "Searching..." : "START RUSH"}</span>
//     </button>

//     <div className="flex items-center gap-3">
//       <button className="w-14 h-14 md:w-16 md:h-16 rounded-[24px] bg-[#1A162D] border border-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all">
//         <RotateCcw className="w-5 h-5 md:w-6 md:h-6" />
//       </button>
//       <button className="w-14 h-14 md:w-16 md:h-16 rounded-[24px] bg-[#1A162D] border border-white/5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all">
//         <Pause className="w-5 h-5 md:w-6 md:h-6" />
//       </button>
//     </div>
//   </div>

//   <div className="flex items-center gap-10">
//     <div className="flex flex-col items-end gap-1">
//       <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Audio Engine</span>
//       <div className="flex items-center gap-3">
//         <span className="text-[10px] font-black text-google-green uppercase tracking-widest leading-none">Active</span>
//         <div className="w-1.5 h-1.5 bg-google-green rounded-full shadow-[0_0_8px_rgba(52,168,83,1)] animate-pulse" />
//       </div>
//     </div>
//     <button className="w-14 h-14 rounded-[24px] bg-[#1A162D] border border-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all">
//       <Volume2 className="w-6 h-6" />
//     </button>
//   </div>
// </footer>