const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '../frontend/dist');

const app = express();
app.use(cors());

// Frontend derlenmiş dosyalarını sunmak için
app.use(express.static(distPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

const QUESTION_TIME = 20;

async function fetchQuestions(amount = 10, category = 'random') {
  try {
    const rawData = fs.readFileSync('./questions.json', 'utf8');
    const questionsDb = JSON.parse(rawData);
    
    let selectedQuestions = [];
    if (category === 'random') {
      const allQuestions = [];
      for (const cat in questionsDb) {
        allQuestions.push(...questionsDb[cat].map(q => ({...q, category: cat})));
      }
      selectedQuestions = allQuestions.sort(() => 0.5 - Math.random()).slice(0, amount);
    } else if (questionsDb[category]) {
      const catQuestions = questionsDb[category].map(q => ({...q, category}));
      selectedQuestions = catQuestions.sort(() => 0.5 - Math.random()).slice(0, amount);
    } else {
        return [];
    }

    return selectedQuestions.map(q => {
      const answers = [...q.answers];
      // Karıştır
      for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
      }
      return {
        question: q.question,
        answers: answers,
        correct_answer: q.correct_answer,
        category: q.category
      };
    });
  } catch (error) {
    console.error("Sorular çekilirken hata oluştu:", error);
    return [];
  }
}

function nextQuestion(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.currentQuestionIndex++;
  room.players.forEach(p => { p.answered = false; p.answer = null; p.intentAnswer = null; }); 
  Object.values(room.teams).forEach(t => { t.answered = false; t.answer = null; }); 

  if (room.currentQuestionIndex >= room.questions.length) {
    room.status = 'ended';
    io.to(roomId).emit('game_over', { players: room.players });
  } else {
    sendQuestion(roomId);
  }
}

function sendQuestion(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.timer);
  room.timeRemaining = QUESTION_TIME;

  const currentQ = room.questions[room.currentQuestionIndex];
  
  const questionPayload = {
    question: currentQ.question,
    answers: currentQ.answers,
    category: currentQ.category,
    index: room.currentQuestionIndex + 1,
    total: room.questions.length,
    timeLimit: QUESTION_TIME
  };

  io.to(roomId).emit('room_update', { 
    players: room.players, 
    teams: room.teams, 
    status: room.status 
  });

  io.to(roomId).emit('new_question', questionPayload);

  room.timer = setInterval(() => {
    room.timeRemaining--;
    io.to(roomId).emit('timer_update', { timeRemaining: room.timeRemaining });

    if (room.timeRemaining <= 0) {
      clearInterval(room.timer);

      // Otomatik Onaylama Mantığı (Süre bittiğinde)
      Object.values(room.teams).forEach(team => {
        if (!team.answered) {
          const membersWithIntent = room.players.filter(p => p.teamId === team.id && p.intentAnswer);
          if (membersWithIntent.length > 0) {
            const counts = {};
            membersWithIntent.forEach(p => { counts[p.intentAnswer] = (counts[p.intentAnswer] || 0) + 1; });
            const mostVoted = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
            
            team.answered = true;
            team.answer = mostVoted;
            const isCorrect = mostVoted === currentQ.correct_answer;
            const points = isCorrect ? 0 : -5;
            team.score += points;
            room.players.filter(p => p.teamId === team.id).forEach(p => {
              p.answered = true;
              p.answer = mostVoted;
              p.score += points;
            });
          }
        }
      });

      room.players.forEach(p => {
        if (!p.teamId && !p.answered && p.intentAnswer) {
          p.answered = true;
          p.answer = p.intentAnswer;
          const isCorrect = p.intentAnswer === currentQ.correct_answer;
          const points = isCorrect ? 0 : -5;
          p.score += points;
        }
      });

      io.to(roomId).emit('question_result', { 
        correct_answer: currentQ.correct_answer,
        players: room.players,
        teams: room.teams
      });
      
      setTimeout(() => {
        nextQuestion(roomId);
      }, 3000); 
    }
  }, 1000);
}


io.on('connection', (socket) => {
  console.log(`Kullanıcı bağlandı: ${socket.id}`);

  socket.on('join_room', ({ roomId, name }) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        players: [],
        teams: {}, // { teamId: { id, name, avatar, leaderId, score: 0, answered: false, answer: null } }
        status: 'lobby',
        questions: [],
        currentQuestionIndex: -1,
        timer: null,
        timeRemaining: 0
      };
    }

    const room = rooms[roomId];

    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push({
        id: socket.id,
        name: name,
        teamId: null, // Takım ID'si
        score: 0,
        answered: false,
        answer: null,
        intentAnswer: null // Takım içi oylama için
      });
    }

    io.to(roomId).emit('room_update', { 
      players: room.players,
      teams: room.teams,
      status: room.status
    });
  });

  socket.on('create_team', ({ roomId, teamName, avatar }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'lobby') return;
    
    const teamId = Math.random().toString(36).substring(2, 8);
    room.teams[teamId] = {
      id: teamId,
      name: teamName,
      avatar: avatar || '🛡️',
      leaderId: socket.id,
      score: 0,
      answered: false,
      answer: null
    };

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.teamId = teamId;
      socket.join(teamId); // Lideri takım odasına dahil et
    }

    io.to(roomId).emit('room_update', { players: room.players, teams: room.teams, status: room.status });
  });

  socket.on('join_team', ({ roomId, teamId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'lobby' || !room.teams[teamId]) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.teamId = teamId;
      socket.join(teamId); // Takım içi özel iletişim için odaya katıl
    }

    io.to(roomId).emit('room_update', { players: room.players, teams: room.teams, status: room.status });
  });

  socket.on('select_intent', ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.teamId) return;

    player.intentAnswer = answer;
    
    // Sadece takımdaki diğer üyelere bildir
    io.to(player.teamId).emit('team_intent_update', { 
      playerId: socket.id, 
      playerName: player.name, 
      answer: answer 
    });
  });
  socket.on('start_game', async ({roomId, category}) => {
    const room = rooms[roomId];
    if (room && room.status === 'lobby') {
      room.status = 'playing';
      io.to(roomId).emit('game_starting');
      
      room.questions = await fetchQuestions(10, category); 
      if (room.questions.length === 0) {
        io.to(roomId).emit('error', { message: 'Sorular yüklenemedi!' });
        return;
      }

      room.currentQuestionIndex = 0;
      setTimeout(() => {
        sendQuestion(roomId);
      }, 1000); 
    }
  });

  socket.on('submit_answer', ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const team = player.teamId ? room.teams[player.teamId] : null;
    
    // Eğer takımdaysa sadece lider onaylayabilir
    if (team && team.leaderId !== socket.id) return;
    if (team && team.answered) return;
    if (!team && player.answered) return;

    const currentQ = room.questions[room.currentQuestionIndex];
    const isCorrect = answer === currentQ.correct_answer;
    const points = isCorrect ? room.timeRemaining : -5;

    if (team) {
      team.answered = true;
      team.answer = answer;
      team.score += points;
      // Takımdaki herkesin bireysel durumunu da güncelle (UI için)
      room.players.filter(p => p.teamId === team.id).forEach(p => {
        p.answered = true;
        p.answer = answer;
        p.score += points;
      });
    } else {
      player.answered = true;
      player.answer = answer;
      player.score += points;
    }

    const allTeamsAnswered = Object.values(room.teams).every(t => t.answered);
    const allSoloAnswered = room.players.filter(p => !p.teamId).every(p => p.answered);

    if (allTeamsAnswered && allSoloAnswered) {
      clearInterval(room.timer);
      io.to(roomId).emit('question_result', { 
        correct_answer: currentQ.correct_answer,
        players: room.players,
        teams: room.teams
      });
      setTimeout(() => {
        nextQuestion(roomId);
      }, 3000);
    } else {
      // Bir takım veya solo oyuncu cevap verdiğinde odaya bildir
      io.to(roomId).emit('room_update', { 
        players: room.players, 
        teams: room.teams, 
        status: room.status 
      });
      
      io.to(roomId).emit('player_answered', { 
        playerId: socket.id, 
        teamId: player.teamId 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          clearInterval(room.timer);
          delete rooms[roomId];
        } else {
          // Eğer çıkan kişi liderse, takımdaki başka birini lider yap veya takımı sil
          for (const teamId in room.teams) {
            const team = room.teams[teamId];
            if (team.leaderId === socket.id) {
              const teamMembers = room.players.filter(p => p.teamId === teamId);
              if (teamMembers.length > 0) {
                team.leaderId = teamMembers[0].id;
              } else {
                delete room.teams[teamId];
              }
            }
          }
          io.to(roomId).emit('room_update', { players: room.players, teams: room.teams, status: room.status });
        }
      }
    }
  });
});

// React Router fallback (SPA desteği)
app.use((req, res) => {
  // Eğer istek bir dosya uzantısı içeriyorsa ve buraya geldiyse, o asset gerçekten yoktur.
  if (path.extname(req.path)) {
    return res.status(404).send('Dosya bulunamadı: ' + req.path);
  }

  try {
    const indexPath = path.resolve(distPath, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    res.set('Content-Type', 'text/html');
    res.send(content);
  } catch (err) {
    console.error('index.html okuma hatası:', err);
    res.status(500).send('Sunucu hatası: index.html dosyası okunamıyor.');
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} portunda çalışıyor.`);
});
