// Using static paths from public folder for robustness
const player1 = "/player1.png";
const player2 = "/player2.png";
const player3 = "/player3.png";
const player4 = "/player4.png";
const player5 = "/player5.png";


// export const DUMMY_Available_PLAYERS = [
//   {
//     uid: 'u_marvin',
//     presence: { status: 'online', meta: { displayName: 'Marvin McKinney' } },
//     profile: { displayName: 'Marvin McKinney', level: 9, xp: 1200, avatar: player1 },
//   },
//   {
//     uid: 'u_jane',
//     presence: { status: 'online', meta: { displayName: 'Jane Cooper' } },
//     profile: { displayName: 'Jane Cooper', level: 8, xp: 980, avatar: player2 },
//   },
//   {
//     uid: 'u_dianne',
//     presence: { status: 'online', meta: { displayName: 'Dianne Russell' } },
//     profile: { displayName: 'Dianne Russell', level: 11, xp: 1650, avatar: player3 },
//   },
//   {
//     uid: 'u_albert',
//     presence: { status: 'in-game', meta: { displayName: 'Albert Flores' } },
//     profile: { displayName: 'Albert Flores', level: 14, xp: 2400, avatar: player4 },
//   },
//   {
//     uid: 'u_brooklyn',
//     presence: { status: 'online', meta: { displayName: 'Brooklyn Simmons' } },
//     profile: { displayName: 'Brooklyn Simmons', level: 4, xp: 350, avatar: player5 },
//   },
//   {
//     uid: 'u_wade',
//     presence: { status: 'online', meta: { displayName: 'Wade Warren' } },
//     profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
//   },
//    {
//     uid: 'u_marvn',
//     presence: { status: 'online', meta: { displayName: 'Marvin McKinney' } },
//     profile: { displayName: 'Marvin McKinney', level: 9, xp: 1200, avatar: player1 },
//   },
//   {
//     uid: 'u_wae',
//     presence: { status: 'online', meta: { displayName: 'Wade Warren' } },
//     profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
//   },
//    {
//     uid: 'u_brooklyn_2',
//     presence: { status: 'online', meta: { displayName: 'Brooklyn Chen' } },
//     profile: { displayName: 'Brooklyn Chen', level: 7, xp: 450, avatar: player5 },
//   },
//   {
//     uid: 'u_wad',
//     presence: { status: 'online', meta: { displayName: 'Wade Warren' } },
//     profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
//   },

//     {
//     id: "1",
//     username: "Ali Khan",
//     avatar: player1,
//     xp: 5200,
//     level: 12,
//     coins: 4,
//     game: "math",
//     isFriend: true
//   },
//   {
//     id: "2",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   },
//   {
//     id: "3",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   },
//   {
//     id: "4",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   },
//   {
//     id: "5",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   },
//   {
//     id: "6",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   },
//   {
//     id: "7",
//     username: "Ahmed Raza",
//     avatar: player2,
//     xp: 4300,
//     level: 10,
//     coins: 3,
//     game: "ludo",
//     isFriend: false
//   }
// ];

// // export const DUMMY_Available_PLAYERS=




// export const DUMMY_LOBBY_PLAYER = [
//   {
//     uid: 'u_marvin',
//     presence: { status: 'online' },
//     profile: {
//       displayName: 'Marvin McKinney',
//       level: 9,
//       xp: 1200,
//       avatar: player1
//     }
//   }
// ];


// Removed dynamic imports to fix 404s in responsive/local network views


export const DUMMY_AVAILABLE_PLAYERS = [
  {
    uid: 'u_marvin',
    presence: { status: 'online', meta: { displayName: 'Marvin McKinney' } },
    profile: { displayName: 'Marvin McKinney', level: 9, xp: 1200, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_jane',
    presence: { status: 'online', meta: { displayName: 'Jane Cooper' } },
    profile: { displayName: 'Jane Cooper', level: 8, xp: 980, avatar: player2 },
    gameType: 'ludo',
  },
  {
    uid: 'u_dianne',
    presence: { status: 'online', meta: { displayName: 'Dianne Russell' } },
    profile: { displayName: 'Dianne Russell', level: 11, xp: 1650, avatar: player3 },
    gameType: 'trivia',
  },
  {
    uid: 'u_albert',
    presence: { status: 'in-game', meta: { displayName: 'Albert Flores' } },
    profile: { displayName: 'Albert Flores', level: 14, xp: 2400, avatar: player4 },
    gameType: 'math',
  },
  {
    uid: 'u_brooklyn',
    presence: { status: 'online', meta: { displayName: 'Brooklyn Simmons' } },
    profile: { displayName: 'Brooklyn Simmons', level: 4, xp: 350, avatar: player5 },
    gameType: 'ludo',
  },
  {
    uid: 'u_wade',
    presence: { status: 'online', meta: { displayName: 'Wade Warren' } },
    profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
    gameType: 'math',
  },
  {
    uid: 'u_marvn',
    presence: { status: 'online', meta: { displayName: 'Marvin McKinney' } },
    profile: { displayName: 'Marvin McKinney', level: 9, xp: 1200, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_wa',
    presence: { status: 'online', meta: { displayName: 'Wade Warrn' } },
    profile: { displayName: 'Wade Warrn', level: 6, xp: 640, avatar: player1 },
    gameType: 'ludo',
  },
  {
    uid: 'u_we',
    presence: { status: 'online', meta: { displayName: 'Wade Waen' } },
    profile: { displayName: 'Wade Waen', level: 6, xp: 640, avatar: player1 },
    gameType: 'ludo',
  },
  {
    uid: 'u_e',
    presence: { status: 'online', meta: { displayName: 'Wade Waren' } },
    profile: { displayName: 'Wade Waren', level: 6, xp: 640, avatar: player1 },
    gameType: 'ludo',
  },
  {
    uid: 'u_brooklyn_2',
    presence: { status: 'online', meta: { displayName: 'Brooklyn Chen' } },
    profile: { displayName: 'Brooklyn Chen', level: 7, xp: 450, avatar: player5 },
    gameType: 'math',
  },
  {
    uid: 'u_wad',
    presence: { status: 'online', meta: { displayName: 'Wade Warren' } },
    profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_d',
    presence: { status: 'online', meta: { displayName: 'Wade rren' } },
    profile: { displayName: 'Wade Wrren', level: 6, xp: 640, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_a',
    presence: { status: 'online', meta: { displayName: 'Wade Wren' } },
    profile: { displayName: 'Wade Wren', level: 6, xp: 640, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_ad',
    presence: { status: 'online', meta: { displayName: 'Wade Wrren' } },
    profile: { displayName: 'Wade Wrren', level: 6, xp: 640, avatar: player1 },
    gameType: 'trivia',
  },
  {
    uid: 'u_wd',
    presence: { status: 'online', meta: { displayName: 'Wade rren' } },
    profile: { displayName: 'Wade Warren', level: 6, xp: 640, avatar: player1 },
    gameType: 'trivia',
  },
];


export const DUMMY_PLAYER_LIST = [
  {
    id: "1",
    username: "Ali Khan",
    avatar: player1,
    xp: 5200,
    level: 12,
    coins: 4,
    game: "math",
    isFriend: true
  },
  {
    id: "2",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  },
  {
    id: "3",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  },
  {
    id: "4",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  },
  {
    id: "5",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  },
  {
    id: "6",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  },
  {
    id: "7",
    username: "Ahmed Raza",
    avatar: player2,
    xp: 4300,
    level: 10,
    coins: 3,
    game: "ludo",
    isFriend: false
  }
];
