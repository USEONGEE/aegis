import React from 'react'
import { Linking } from 'react-native'
import Markdown from '@ronradtke/react-native-markdown-display'
import { markdownDarkStyles } from './markdownDarkStyles'

interface MarkdownBubbleProps {
  content: string
}

function MarkdownBubble({ content }: MarkdownBubbleProps) {
  return (
    <Markdown
      style={markdownDarkStyles}
      onLinkPress={(url: string) => {
        Linking.openURL(url)
        return false
      }}
    >
      {content}
    </Markdown>
  )
}

export default React.memo(MarkdownBubble)
