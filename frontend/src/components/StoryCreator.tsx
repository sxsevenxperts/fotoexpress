import { useState, useEffect } from 'react';
import axios from 'axios';
import './StoryCreator.css';

interface Story {
  id: number;
  title: string;
  description: string;
  video_url: string;
  cover_image_url: string;
  status: string;
  created_at: string;
}

interface Photo {
  photo_id: string;
  thumbnail_url: string;
  gallery_title: string;
}

export default function StoryCreator() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [transitionType, setTransitionType] = useState('fade');
  const [durationPerPhoto, setDurationPerPhoto] = useState('3.0');
  const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');
  const token = localStorage.getItem('token');

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      const [photosRes, storiesRes] = await Promise.all([
        axios.get('/api/purchases/photos', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/stories', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setPhotos(photosRes.data.photos || []);
      setStories(storiesRes.data.stories || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const togglePhoto = (photoId: string) => {
    setSelectedPhotos(prev =>
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const handleCreateStory = async () => {
    if (selectedPhotos.length === 0) {
      alert('Selecione pelo menos uma foto');
      return;
    }

    setIsCreating(true);
    try {
      const res = await axios.post(
        '/api/stories',
        {
          title: title || 'Minha História',
          description,
          photo_ids: selectedPhotos,
          transition_type: transitionType,
          duration_per_photo: parseFloat(durationPerPhoto)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setStories([res.data, ...stories]);
      setSelectedPhotos([]);
      setTitle('');
      setDescription('');
      alert('História criada com sucesso! Processamento iniciado...');
      setActiveTab('view');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar história');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteStory = async (storyId: number) => {
    if (!confirm('Tem certeza que deseja deletar essa história?')) return;

    try {
      await axios.delete(`/api/stories/${storyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStories(stories.filter(s => s.id !== storyId));
      alert('História deletada');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao deletar história');
    }
  };

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div className="story-creator">
      <div className="story-tabs">
        <button
          className={`tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          ✨ Criar Histórias
        </button>
        <button
          className={`tab ${activeTab === 'view' ? 'active' : ''}`}
          onClick={() => setActiveTab('view')}
        >
          📹 Minhas Histórias ({stories.length})
        </button>
      </div>

      {activeTab === 'create' && (
        <div className="create-section">
          <div className="form-group">
            <label>Título da História</label>
            <input
              type="text"
              placeholder="Ex: Meu Melhor Dia"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Descrição (opcional)</label>
            <textarea
              placeholder="Descreva sua história..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Transição</label>
              <select value={transitionType} onChange={e => setTransitionType(e.target.value)}>
                <option value="fade">Fade</option>
                <option value="slide">Deslize</option>
                <option value="zoom">Zoom</option>
              </select>
            </div>

            <div className="form-group">
              <label>Segundos por Foto</label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={durationPerPhoto}
                onChange={e => setDurationPerPhoto(e.target.value)}
              />
            </div>
          </div>

          <div className="photos-section">
            <h3>Selecione Fotos ({selectedPhotos.length}/{photos.length})</h3>
            {photos.length === 0 ? (
              <p className="no-photos">Você ainda não tem fotos para criar uma história</p>
            ) : (
              <div className="photos-grid">
                {photos.map(photo => (
                  <div
                    key={photo.photo_id}
                    className={`photo-item ${selectedPhotos.includes(photo.photo_id) ? 'selected' : ''}`}
                    onClick={() => togglePhoto(photo.photo_id)}
                  >
                    <img src={photo.thumbnail_url} alt={photo.gallery_title} />
                    {selectedPhotos.includes(photo.photo_id) && (
                      <div className="check-mark">✓</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn-create"
            onClick={handleCreateStory}
            disabled={isCreating || selectedPhotos.length === 0}
          >
            {isCreating ? 'Criando...' : '✨ Gerar Histórias'}
          </button>
        </div>
      )}

      {activeTab === 'view' && (
        <div className="view-section">
          {stories.length === 0 ? (
            <p className="no-stories">Você ainda não criou histórias</p>
          ) : (
            <div className="stories-grid">
              {stories.map(story => (
                <div key={story.id} className="story-card">
                  {story.cover_image_url && (
                    <img src={story.cover_image_url} alt={story.title} className="story-cover" />
                  )}
                  <div className="story-info">
                    <h3>{story.title}</h3>
                    {story.description && <p>{story.description}</p>}
                    <div className="story-meta">
                      <span className={`status ${story.status}`}>
                        {story.status === 'pending' && '⏳ Pendente'}
                        {story.status === 'generating' && '⚙️ Processando'}
                        {story.status === 'completed' && '✅ Completa'}
                        {story.status === 'failed' && '❌ Erro'}
                      </span>
                      <span className="date">
                        {new Date(story.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="story-actions">
                    {story.status === 'completed' && story.video_url && (
                      <a href={story.video_url} download className="btn-download">
                        ⬇️ Baixar
                      </a>
                    )}
                    <button
                      className="btn-delete"
                      onClick={() => deleteStory(story.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
