import React from 'react';
import { Platform, Text, StyleSheet } from 'react-native';
import { API_URL } from '../constants/api';
import { convertPuaCharacters } from '../utils/contentPasteNormalizer';

interface RichContentDisplayProps {
  html: string;
  fontSize: number;
}

function cleanContentHtml(value: string) {
  return convertPuaCharacters(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<font\b[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (match) => {
      let css = match.replace(/^\s*style\s*=\s*["']|["']$/gi, '');
      css = css.replace(/mso-[^;]+;?/gi, '').replace(/font-family\s*:\s*[^;]+;?/gi, '').trim();
      return css ? ` style="${css}"` : '';
    })
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export default function RichContentDisplay({ html, fontSize }: RichContentDisplayProps) {
  if (Platform.OS !== 'web') {
    return <Text style={[styles.nativeText, { fontSize, lineHeight: fontSize * 1.5 }]}>{convertPuaCharacters(html).replace(/<[^>]+>/g, '')}</Text>;
  }

  const displayHtml = cleanContentHtml(html)
    .replace(/src="(?:https?:\/\/[^/]+)?(\/uploads\/[^"]+)"/g, (_match, path) => `src="${API_URL.replace(/\/api$/, '')}${path}"`)
    .replace(/<img\b(?![^>]*style=)/gi, '<img style="max-width:100%;height:auto;display:block;margin:12px 0;"');

  return (
    <div
      className="lesson-rich-content"
      dangerouslySetInnerHTML={{ __html: displayHtml }}
      style={{ ...webContentStyle, fontSize, lineHeight: 1.5 }}
    />
  );
}

const webContentStyle: React.CSSProperties = {
  color: '#2D2D35',
  fontFamily: 'Spline Sans',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap'
};

const styles = StyleSheet.create({
  nativeText: { color: '#2D2D35', fontFamily: 'Spline Sans' }
});

