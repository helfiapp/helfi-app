'use client'

import React, { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'

const defaultIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function SetViewOnChange({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

export type DirectoryMapMarker = {
  id: string
  name: string
  lat: number
  lng: number
  address?: string | null
  isBoosted?: boolean
}

type DirectoryMapProps = {
  center: { lat: number; lng: number }
  radiusKm?: number
  markers: DirectoryMapMarker[]
  onMarkerClick?: (id: string) => void
}

function MarkerItem({ marker, onMarkerClick }: { marker: DirectoryMapMarker; onMarkerClick?: (id: string) => void }) {
  const map = useMap()
  const addressLine = useMemo(() => {
    const trimmed = String(marker.address || '').trim()
    return trimmed ? trimmed : null
  }, [marker.address])

  return (
    <Marker
      key={marker.id}
      position={[marker.lat, marker.lng]}
      icon={defaultIcon}
      eventHandlers={{
        click: () => {
          const targetZoom = Math.max(map.getZoom(), 14)
          map.flyTo([marker.lat, marker.lng], targetZoom)
          onMarkerClick?.(marker.id)
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -16]} opacity={1} sticky>
        <div className="text-xs font-semibold text-gray-900 whitespace-nowrap">{marker.name}</div>
        {addressLine ? <div className="text-[10px] text-gray-600 leading-snug">{addressLine}</div> : null}
        {marker.isBoosted ? <div className="text-[10px] text-emerald-700">Boosted</div> : null}
      </Tooltip>
    </Marker>
  )
}

export default function DirectoryMap({ center, radiusKm, markers, onMarkerClick }: DirectoryMapProps) {
  const zoom = radiusKm && radiusKm <= 5 ? 13 : radiusKm && radiusKm <= 10 ? 12 : radiusKm && radiusKm <= 25 ? 11 : 10
  const mapProps = {
    center: [center.lat, center.lng],
    zoom,
    scrollWheelZoom: true,
  } as any

  return (
    <MapContainer
      {...mapProps}
      className="h-full w-full rounded-2xl overflow-hidden border border-gray-200"
    >
      <SetViewOnChange center={[center.lat, center.lng]} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {radiusKm ? (
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.08 }}
        />
      ) : null}
      {markers.map((marker) => (
        <MarkerItem key={marker.id} marker={marker} onMarkerClick={onMarkerClick} />
      ))}
    </MapContainer>
  )
}
