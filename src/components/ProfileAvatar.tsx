import React, { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { AvatarCropper } from './AvatarCropper';

const STORAGE_KEY = 'nido_profile_pic';

export const ProfileAvatar: React.FC = () => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pic, setPic] = useState(() => localStorage.getItem(STORAGE_KEY));
  const fallback = user?.username === 'maria' ? '👩‍🎨' : '👨‍💻';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleCrop = (dataUrl: string) => {
    localStorage.setItem(STORAGE_KEY, dataUrl);
    setPic(dataUrl);
    setCropSrc(null);
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
      {cropSrc && (
        <AvatarCropper
          imageUrl={cropSrc}
          onCrop={handleCrop}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  );
};
