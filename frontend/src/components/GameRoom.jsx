import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Copy, Users, CheckCircle, Clock, Trophy, List, Shield, User } from 'lucide-react';

const socket = io(import.meta.env.DEV ? 'http://localhost:3001' : '/', {
  transports: ['websocket', 'polling']
});

const getUserId = () => {
  let id = localStorage.getItem('trivia_user_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('trivia_user_id', id);
  }
  return id;
};

const AVATARS = ['🐉', '🦁', '🦅', '🐺', '🦈', '🐻', '🐼', '🦊', '🦉', '🦄'];

export default function GameRoom() {
  const { roomId } = useParams();
  const location = useLocation();
  const [playerName, setPlayerName] = useState(location.state?.playerName || '');
  const [hasJoined, setHasJoined] = useState(false);
  const userId = getUserId();
  
  const [roomState, setRoomState] = useState({
    players: [],
    teams: {},
    status: 'lobby',
    hostId: null
  });
  
  const [questionData, setQuestionData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('random');

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamAvatar, setNewTeamAvatar] = useState('🐉');

  // Takım arkadaşlarının seçimlerini tutmak için (id -> answer)
  const [teamIntents, setTeamIntents] = useState({});

  useEffect(() => {
    if (hasJoined) {
      const handleJoin = () => {
        socket.emit('join_room', { roomId, name: playerName, userId });
      };

      // İlk girişte katıl
      handleJoin();

      // Bağlantı kopup tekrar geldiğinde (mobilde uygulama öne geldiğinde) otomatik katıl
      socket.on('connect', handleJoin);

      socket.on('room_update', (data) => {
        setRoomState({
          players: data.players || [],
          teams: data.teams || {},
          status: data.status
        });
      });

      socket.on('game_starting', () => {
        setRoomState(prev => ({ ...prev, status: 'playing' }));
      });

      socket.on('new_question', (data) => {
        setQuestionData(data);
        setTimeRemaining(data.timeLimit);
        setResultData(null);
        setSelectedAnswer(null);
        setTeamIntents({}); // Yeni soruda seçimleri sıfırla
      });

      socket.on('timer_update', (data) => {
        setTimeRemaining(data.timeRemaining);
      });

      socket.on('question_result', (data) => {
        setResultData(data);
        setRoomState(prev => ({ 
          ...prev, 
          players: data.players, 
          teams: data.teams || prev.teams 
        }));
      });

      socket.on('team_intent_update', (data) => {
        setTeamIntents(prev => ({
          ...prev,
          [data.playerId]: { name: data.playerName, answer: data.answer }
        }));
      });

      socket.on('game_over', (data) => {
        setRoomState(prev => ({ ...prev, status: 'ended', players: data.players, teams: data.teams || prev.teams }));
      });

      socket.on('error', (data) => {
        alert(data.message);
      });

      return () => {
        socket.off('connect', handleJoin);
        socket.off('room_update');
        socket.off('game_starting');
        socket.off('new_question');
        socket.off('timer_update');
        socket.off('question_result');
        socket.off('team_intent_update');
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
    socket.emit('start_game', { roomId, category: selectedCategory });
  };

  const selectIntent = (answer) => {
    if (resultData) return;
    setSelectedAnswer(answer);
    socket.emit('select_intent', { roomId, answer });
    
    // Eğer bir takımda değilse doğrudan gönder (solo oyuncu)
    if (!myPlayer?.teamId) {
      socket.emit('submit_answer', { roomId, answer });
    }
  };

  const submitFinalAnswer = () => {
    if (selectedAnswer && !resultData) {
      socket.emit('submit_answer', { roomId, answer: selectedAnswer });
    }
  };

  const createTeam = (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    socket.emit('create_team', { roomId, teamName: newTeamName, avatar: newTeamAvatar });
    setNewTeamName('');
  };

  const joinTeam = (teamId) => {
    socket.emit('join_team', { roomId, teamId });
  };

  const myPlayer = roomState.players.find(p => p.id === socket.id);
  const myTeam = myPlayer?.teamId ? roomState.teams[myPlayer.teamId] : null;
  const isLeader = myTeam?.leaderId === userId;
  const isHost = roomState.hostId === userId;

  if (roomState.status === 'lobby') {
    return (
      <div className="glass-container" style={{ maxWidth: '900px' }}>
        <h2>Bekleme Odası</h2>
        <p>Oda ID: <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>{roomId}</span></p>
        
        <div style={{ margin: '1rem 0' }}>
          <button className="btn btn-secondary" onClick={copyInviteLink}>
            <Copy size={18} /> Davet Linkini Kopyala
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', textAlign: 'left', marginTop: '2rem' }}>
          <div>
            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              🛡️ Takımlar
            </h3>
            
            {!myPlayer?.teamId && (
              <form onSubmit={createTeam} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Yeni Takım Kur</h4>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <select 
                    className="input-field" 
                    style={{ width: '60px', padding: '0.5rem' }}
                    value={newTeamAvatar} 
                    onChange={e => setNewTeamAvatar(e.target.value)}
                  >
                    {AVATARS.map(av => <option key={av} value={av}>{av}</option>)}
                  </select>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Takım İsmi" 
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    maxLength={15}
                  />
                </div>
                <button type="submit" className="btn" style={{ padding: '0.5rem', fontSize: '0.9rem' }}>Takım Kur</button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {Object.values(roomState.teams).map(team => {
                const teamMembers = roomState.players.filter(p => p.teamId === team.id);
                const leader = roomState.players.find(p => p.userId === team.leaderId);
                return (
                  <div key={team.id} style={{ 
                    background: myPlayer?.teamId === team.id ? 'rgba(0, 242, 254, 0.1)' : 'rgba(255,255,255,0.05)', 
                    border: myPlayer?.teamId === team.id ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                    padding: '1rem', 
                    borderRadius: '8px' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{team.avatar} {team.name}</span>
                      {myPlayer?.teamId !== team.id && (
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => joinTeam(team.id)}>Katıl</button>
                      )}
                      {myPlayer?.teamId === team.id && <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 'bold' }}>Senin Takımın</span>}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Lider: {leader?.name || 'Bilinmiyor'}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem', fontSize: '0.9rem' }}>
                      {teamMembers.map(m => (
                        <li key={m.id}>• {m.name} {m.id === socket.id && '(Sen)'}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {Object.keys(roomState.teams).length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Henüz takım kurulmadı. Hemen bir takım kur!</p>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              <Users size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} /> Oyuncular ({roomState.players.length})
            </h3>
            <ul className="player-list" style={{ marginBottom: '2rem' }}>
              {roomState.players.map((p, index) => {
                const pTeam = p.teamId ? roomState.teams[p.teamId] : null;
                return (
                  <li key={p.id} className="player-item" style={{ animationDelay: `${index * 0.1}s`, padding: '0.8rem', opacity: p.connected ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.connected ? 'var(--success)' : '#666' }}></div>
                      <span>{p.name} {p.id === socket.id && '(Sen)'} {!p.connected && '(Ayrıldı)'}</span>
                    </div>
                    {pTeam ? (
                      <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.5rem', borderRadius: '12px' }}>
                        {pTeam.avatar} {pTeam.name}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Takımsız</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {isHost ? (
              <>
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <List size={18} /> Soru Kategorisi
                </h3>
                <select 
                  className="input-field" 
                  style={{ cursor: 'pointer', marginBottom: '1.5rem' }}
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

                <button className="btn" onClick={startGame} style={{ width: '100%' }}>
                  Oyunu Başlat
                </button>
              </>
            ) : (
              <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Hostun oyunu başlatması bekleniyor...
              </div>
            )}
          </div>
        </div>
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

    // Takım arkadaşlarının hangi cevabı seçtiğini bul
    const getIntentsForAnswer = (answer) => {
      return Object.entries(teamIntents)
        .filter(([_, data]) => data.answer === answer)
        .map(([id, data]) => ({ id, name: data.name }));
    };

    const hasTeamAnswered = myTeam?.answered;

    return (
      <div className="glass-container" style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
          {myTeam && (
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold', border: '1px solid var(--primary)' }}>
              {myTeam.avatar} Takım: {myTeam.name} {isLeader && <span style={{fontSize: '0.7rem', color: 'var(--primary)', marginLeft: '0.5rem'}}>(Lider)</span>}
            </div>
          )}
          {!myTeam && (
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold' }}>
              👤 Bireysel Yarışmacı
            </div>
          )}
        </div>

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
            const intents = getIntentsForAnswer(ans);
            
            if (resultData) {
              if (ans === resultData.correct_answer) {
                btnClass += " correct"; 
              } else if (ans === selectedAnswer || (myTeam?.answer === ans)) {
                btnClass += " incorrect"; 
              }
            } else if (selectedAnswer === ans) {
              btnClass += " selected";
            }

            return (
              <div key={idx} style={{ position: 'relative' }}>
                <button 
                  className={btnClass}
                  style={selectedAnswer === ans && !resultData ? { borderColor: 'var(--primary)', background: 'rgba(255,255,255,0.1)' } : {}}
                  onClick={() => selectIntent(ans)}
                  disabled={(myTeam && hasTeamAnswered) || (!myTeam && selectedAnswer !== null) || resultData !== null}
                >
                  {decodeHTML(ans)}
                </button>
                
                {/* Takım içi oylama göstergeleri - İsim Etiketleri */}
                {myTeam && intents.length > 0 && !resultData && (
                  <div style={{ 
                    position: 'absolute', 
                    right: '10px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-end', 
                    gap: '4px', 
                    pointerEvents: 'none',
                    zIndex: 10
                  }}>
                    {intents.map(m => (
                      <span key={m.id} style={{ 
                        fontSize: '0.65rem', 
                        background: 'var(--primary)', 
                        color: '#000', 
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontWeight: 'bold',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}>
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Lider Onay Butonu */}
        {isLeader && selectedAnswer && !hasTeamAnswered && !resultData && (
          <button className="btn" onClick={submitFinalAnswer} style={{ marginTop: '2rem', background: 'var(--success)' }}>
            <CheckCircle size={20} /> Takım Kararını Onayla
          </button>
        )}

        {hasTeamAnswered && !resultData && (
          <p style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold' }}>
            Takım kararı gönderildi, bekleniyor...
          </p>
        )}
        
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {Object.values(roomState.teams || {}).map(team => (
            <div key={team.id} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              background: team.answered ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0,0,0,0.2)', 
              padding: '0.5rem 1rem', 
              borderRadius: '12px',
              border: team.answered ? '1px solid var(--success)' : '1px solid transparent'
            }}>
              <span style={{ fontSize: '1.5rem' }}>{team.avatar}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{team.name}</span>
              {team.answered && <CheckCircle size={12} style={{ color: 'var(--success)' }} />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (roomState.status === 'ended') {
    // Skorları birleştir (Takım veya Solo)
    const leaderboard = [];
    Object.values(roomState.teams).forEach(t => {
      leaderboard.push({ name: t.name, score: t.score, avatar: t.avatar, isTeam: true });
    });
    roomState.players.filter(p => !p.teamId).forEach(p => {
      leaderboard.push({ name: p.name, score: p.score, avatar: '👤', isTeam: false });
    });

    const sortedLeaderboard = leaderboard.sort((a, b) => b.score - a.score);
    
    return (
      <div className="glass-container">
        <Trophy size={48} color="#FFD700" style={{ marginBottom: '1rem' }} />
        <h2>Oyun Bitti!</h2>
        
        <ul className="player-list" style={{ marginTop: '2rem' }}>
          {sortedLeaderboard.map((item, index) => (
            <li key={index} className="player-item" style={{ 
              background: index === 0 ? 'rgba(255, 215, 0, 0.1)' : '',
              border: index === 0 ? '1px solid rgba(255, 215, 0, 0.3)' : ''
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: index === 0 ? '#FFD700' : 'inherit' }}>#{index + 1}</span>
                <span>{item.avatar} {item.name}</span>
              </div>
              <span className="player-score">{item.score} Puan</span>
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
