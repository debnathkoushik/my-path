import React, { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';

export default function ShareButton({ routeId, routeName }) {
  const [copied, setCopied] = useState(false);

  const getShareUrl = () => {
    return `${window.location.origin}${window.location.pathname}#/path/${routeId}`;
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();
    const shareData = {
      title: routeName || 'My Traveled Route',
      text: `Check out my tracked GPS route: ${routeName || ''}`,
      url: shareUrl
    };

    // Check if navigator.share is supported
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
          copyToClipboard(shareUrl);
        }
      }
    } else {
      // Fallback to copy to clipboard
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy to clipboard:', err);
      });
  };

  return (
    <button
      onClick={handleShare}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%',
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: copied ? 'var(--success)' : 'var(--primary)',
        border: 'none',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        boxShadow: copied ? '0 4px 12px var(--success-glow)' : '0 4px 12px var(--primary-glow)',
        transition: 'all 0.3s ease'
      }}
    >
      {copied ? (
        <>
          <Check size={16} />
          Link Copied!
        </>
      ) : (
        <>
          <Share2 size={16} />
          Share Route Link
        </>
      )}
    </button>
  );
}
