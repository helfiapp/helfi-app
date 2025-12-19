'use client'

import React from 'react'

type MaterialSymbolProps = {
  name: string
  className?: string
}

export default function MaterialSymbol({ name, className }: MaterialSymbolProps) {
  return <span className={`material-symbols-outlined ${className || ''}`.trim()}>{name}</span>
}

