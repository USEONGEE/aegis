import { Platform, StyleSheet } from 'react-native'

const monospace = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

export const markdownDarkStyles = StyleSheet.create({
  body: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  heading1: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
  },
  heading2: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
  },
  heading3: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  strong: {
    fontWeight: '700',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    paddingLeft: 10,
    marginLeft: 0,
    backgroundColor: '#111111',
  },
  code_inline: {
    backgroundColor: '#2a2a2a',
    color: '#e5e7eb',
    fontFamily: monospace,
    fontSize: 12,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  code_block: {
    backgroundColor: '#1a1a1a',
    color: '#e5e7eb',
    fontFamily: monospace,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  fence: {
    backgroundColor: '#1a1a1a',
    color: '#e5e7eb',
    fontFamily: monospace,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 4,
    marginVertical: 6,
  },
  thead: {
    backgroundColor: '#1a1a1a',
  },
  th: {
    padding: 6,
    borderWidth: 1,
    borderColor: '#374151',
    fontWeight: '600',
  },
  td: {
    padding: 6,
    borderWidth: 1,
    borderColor: '#374151',
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: '#374151',
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  hr: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 8,
  },
  paragraph: {
    marginVertical: 4,
  },
  // suppress image rendering (PRD 비목표)
  image: {
    width: 0,
    height: 0,
  },
})
