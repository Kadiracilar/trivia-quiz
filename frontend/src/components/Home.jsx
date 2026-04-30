import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';

export default function Home() {
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Rastgele bir oda ID oluştur
    const roomId = Math.random().toString(36).substring(2, 8);
    // İsmi state ile pasla
    navigate(`/room/${roomId}`, { state: { playerName: name } });
  };

  return (
    <div className="glass-container">
      <h1>Trivia Master</h1>
      <p style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>
        Gerçek zamanlı bilgi yarışmasına hoş geldin! Kendi odanı kur ve arkadaşlarını davet et.
      </p>

      <form onSubmit={handleCreateRoom}>
        <input 
          type="text" 
          className="input-field" 
          placeholder="Adınızı girin..." 
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={15}
          required
        />
        <button type="submit" className="btn">
          <Play size={20} /> Oda Kur ve Başla
        </button>
      </form>
    </div>
  );
}
