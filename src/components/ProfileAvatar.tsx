import React, { useRef } from 'react';
import { useAuth } from '../auth';

const STORAGE_KEY = 'nido_profile_pic';

export const ProfileAvatar: React.FC = () => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const pic = localStorage.getItem(STORAGE_KEY);
  const fallback = user?.username === 'maria' ? '👩‍🎨' : '👨‍💻';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Resize to 128px for storage efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        localStorage.setItem(STORAGE_KEY, canvas.toDataURL('image/jpeg', 0.8));
        window.dispatchEvent(new Event('storage'));
        // Force re-render
        window.location.reload();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <button className="profile-avatar" onClick={() => fileRef.current?.click()}>
        {pic ? (
          <img src={pic} alt="perfil" className="profile-avatar-img" />
        ) : (
          <span className="profile-avatar-fallback">{fallback}</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </>
  );
};
