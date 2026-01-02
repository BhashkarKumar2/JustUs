import useWebRTC from './useWebRTC';

export default function useVideoCall(props) {
  return useWebRTC({
    ...props,
    type: 'video'
  });
}
