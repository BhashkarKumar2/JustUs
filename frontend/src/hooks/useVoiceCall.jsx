import useWebRTC from './useWebRTC';

export default function useVoiceCall(props) {
  return useWebRTC({
    ...props,
    type: 'audio'
  });
}
