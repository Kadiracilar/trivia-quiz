import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Copy, Users, CheckCircle, Clock, Trophy, List } from 'lucide-react';

// Eğer geliştirme aşamasındaysak (Vite) localhost:3001'e, eğer tünel/sunucu üzerindeysek doğrudan aynı adrese bağlan
const socket = io(import.meta.env.DEV ? 'http://localhost:3001' : '/');

export default function GameRoom() {
  const { roomId } = useParams();
  const location = useLocation();
  const [playerName, setPlayerName] = useState(location.state?.playerName || '');
  const [hasJoined, setHasJoined] = useState(false);
  
  const [roomState, setRoomState] = useState({
    players: [],
    status: 'lobby'
  });
  
  const [questionData, setQuestionData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  
  // Kategori seçimi için state
  const [selectedCategory, setSelectedCategory] = useState('random');

  useEffect(() => {
    if (hasJoined) {
      socket.emit('join_room', { roomId, name: playerName });

      socket.on('room_update', (data) => {
        setRoomState(data);
      });

      socket.on('game_starting', () => {
        setRoomState(prev => ({ ...prev, status: 'playing' }));
      });

      socket.on('new_question', (data) => {
        setQuestionData(data);
        setTimeRemaining(data.timeLimit);
        setResultData(null);
        setSelectedAnswer(null);
      });

      socket.on('timer_update', (data) => {
        setTimeRemaining(data.timeRemaining);
      });

      socket.on('question_result', (data) => {
        setResultData(data);
        setRoomState(prev => ({ ...prev, players: data.players }));
      });

      socket.on('game_over', (data) => {
        setRoomState(prev => ({ ...prev, status: 'ended', players: data.players }));
      });

      socket.on('error', (data) => {
        alert(data.message);
      });

      return () => {
        socket.off('room_update');
        socket.off('game_starting');
        socket.off('new_question');
        socket.off('timer_update');
        socket.off('question_result');
        socket.off('game_over');
        socket.off('error');
      };
    }
  }, [hasJoined, roomId, playerName]);

  if (!hasJoined) {
    return (
      <div className="glass-container">
        <h2>Odaya Katıl</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
          {roomId} numaralı odaya katılıyorsunuz. Lütfen adınızı girin.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if(playerName) setHasJoined(true); }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Adınızı girin..." 
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
            maxLength={15}
          />
          <button type="submit" className="btn">Katıl</button>
        </form>
      </div>
    );
  }

  const copyInviteLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert('Davet linki kopyalandı!');
  };

  const startGame = () => {
    // Kategori bilgisini gönder
    socket.emit('start_game', { roomId, category: selectedCategory });
  };

  const submitAnswer = (answer) => {
    setSelectedAnswer(answer);
    socket.emit('submit_answer', { roomId, answer });
  };

  if (roomState.status === 'lobby') {
    return (
      <div className="glass-container">
        <h2>Bekleme Odası</h2>
        <p>Oda ID: <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>{roomId}</span></p>
        
        <div style={{ margin: '2rem 0' }}>
          <button className="btn btn-secondary" onClick={copyInviteLink}>
            <Copy size={18} /> Davet Linkini Kopyala
          </button>
        </div>

        <div style={{ textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} /> Oyuncular ({roomState.players.length})
          </h3>
          <ul className="player-list">
            {roomState.players.map((p, index) => (
              <li key={p.id} className="player-item" style={{ animationDelay: `${index * 0.1}s` }}>
                {p.name} {p.id === socket.id && '(Sen)'}
                <CheckCircle size={18} color="var(--success)" />
              </li>
            ))}
          </ul>
        </div>

        {/* Kategori Seçimi */}
        <div style={{ marginTop: '2rem', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <List size={20} /> Soru Kategorisi
          </h3>
          <select 
            className="input-field" 
            style={{ cursor: 'pointer' }}
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="random">🎲 Rastgele (Karışık)</option>
            <option value="Genel Kültür">🌍 Genel Kültür</option>
            <option value="Spor">⚽ Spor</option>
            <option value="Tarih">🏛️ Tarih</option>
            <option value="Bilim">🔬 Bilim</option>
            <option value="Coğrafya">🗺️ Coğrafya</option>
          </select>
        </div>

        <button className="btn" onClick={startGame} style={{ marginTop: '1rem' }}>
          Oyunu Başlat
        </button>
      </div>
    );
  }

  if (roomState.status === 'playing') {
    if (!questionData) {
      return <div className="glass-container"><h2>Sorular Yükleniyor...</h2></div>;
    }

    const decodeHTML = (html) => {
      const txt = document.createElement("textarea");
      txt.innerHTML = html;
      return txt.value;
    };

    return (
      <div className="glass-container" style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>
            Soru {questionData.index} / {questionData.total}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--primary)' }}>
            <Clock size={18} /> {timeRemaining}s
          </span>
        </div>

        <div className="progress-bar-container">
          <div 
            className="progress-bar" 
            style={{ 
              width: `${(timeRemaining / questionData.timeLimit) * 100}%`,
              background: timeRemaining <= 5 ? 'var(--danger)' : 'var(--primary)'
            }}
          ></div>
        </div>

        <div className="category-text">{decodeHTML(questionData.category)}</div>
        <h2 className="question-text">{decodeHTML(questionData.question)}</h2>

        <div className="answer-grid">
          {questionData.answers.map((ans, idx) => {
            let btnClass = "answer-btn";
            
            if (resultData) {
              if (ans === resultData.correct_answer) {
                btnClass += " correct"; 
              } else if (ans === selectedAnswer) {
                btnClass += " incorrect"; 
              }
            } else if (selectedAnswer === ans) {
              btnClass += " selected";
            }

            return (
              <button 
                key={idx} 
                className={btnClass}
                style={selectedAnswer === ans && !resultData ? { borderColor: 'var(--primary)', background: 'rgba(255,255,255,0.1)' } : {}}
                onClick={() => submitAnswer(ans)}
                disabled={selectedAnswer !== null || resultData !== null}
              >
                {decodeHTML(ans)}
              </button>
            )
          })}
        </div>
      </div>
    );
  }

  if (roomState.status === 'ended') {
    const sortedPlayers = [...roomState.players].sort((a, b) => b.score - a.score);
    
    return (
      <div className="glass-container">
        <Trophy size={48} color="#FFD700" style={{ marginBottom: '1rem' }} />
        <h2>Oyun Bitti!</h2>
        
        <ul className="player-list" style={{ marginTop: '2rem' }}>
          {sortedPlayers.map((p, index) => (
            <li key={p.id} className="player-item" style={{ 
              background: index === 0 ? 'rgba(255, 215, 0, 0.1)' : '',
              border: index === 0 ? '1px solid rgba(255, 215, 0, 0.3)' : ''
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: index === 0 ? '#FFD700' : 'inherit' }}>#{index + 1}</span>
                <span>{p.name} {p.id === socket.id && '(Sen)'}</span>
              </div>
              <span className="player-score">{p.score} Puan</span>
            </li>
          ))}
        </ul>

        <button className="btn btn-secondary" onClick={() => window.location.href = '/'} style={{ marginTop: '2rem' }}>
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  return null;
}
